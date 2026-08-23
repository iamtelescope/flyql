import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorEngine, insertAtSelection, truncateLabel, labelWasTruncated, signatureArgs } from 'flyql/editor'
import './flyql.css'

// Diagnostics are debounced on the typing path so squiggles/panels don't
// flash the moment a keystroke is incomplete. Decisive actions (suggestion
// accept, Tab cycle, prop change, external flush) bypass the delay.
//
// A second longer timer (IDLE) re-runs diagnostics with includeEof=true,
// so EOF-suppressed errors (unclosed `[`, `(`, `"` …) eventually surface
// once the user truly pauses. Both timers reset on every keystroke.
const DIAG_DEBOUNCE_MS = 400
const DIAG_IDLE_MS = 2000

// Mirror of Vue's nextTick usage: run after the current event/render settles.
const defer = (fn) => setTimeout(fn, 0)

// Stable default — an inline [] default would re-trigger the parameters
// effect on every render.
const EMPTY_PARAMETERS = []

function badgeText(type) {
    switch (type) {
        case 'column':
        case 'columnRef':
            return 'C'
        case 'operator':
            return 'Op'
        case 'value':
            return 'V'
        case 'boolOp':
            return 'B'
        case 'transformer':
            return 'T'
        default:
            return '?'
    }
}

const FlyqlEditor = forwardRef(function FlyqlEditor(
    {
        value = '',
        onChange = null,
        columns = null,
        parameters = EMPTY_PARAMETERS,
        onAutocomplete = null,
        onKeyDiscovery = null,
        placeholder = '',
        autofocus = false,
        debug = false,
        debounceMs = 150,
        dark = false,
        registry = null,
        icon = null,
        label = '',
        onSubmit = null,
        onParseError = null,
        onFocus = null,
        onBlur = null,
        onDiagnostics = null,
    },
    ref,
) {
    const [focused, setFocused] = useState(false)
    const [activated, setActivatedState] = useState(false)
    const [suggestions, setSuggestions] = useState([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [context, setContext] = useState(null)
    const [activeTab, setActiveTab] = useState('values')
    const [diagnostics, setDiagnostics] = useState([])
    const [hoveredDiagIndex, setHoveredDiagIndex] = useState(-1)
    const [selectedInfo, setSelectedInfo] = useState(null)
    const [panelLeft, setPanelLeft] = useState(0)
    const [panelTop, setPanelTop] = useState(0)

    const textareaRef = useRef(null)
    const highlightRef = useRef(null)
    const containerRef = useRef(null)
    const panelRef = useRef(null)
    const itemRefs = useRef({})
    const panelInteractingRef = useRef(false)
    const suggestionTypeRef = useRef('')
    const lastParseErrorRef = useRef(null)
    const diagTimerRef = useRef(null)
    const diagIdleTimerRef = useRef(null)
    const mountedRef = useRef(false)
    // Mirrors of reactive state for stable listeners (window scroll)
    const focusedRef = useRef(false)
    const activatedRef = useRef(false)
    const contextRef = useRef(null)

    // ── Engine (created once; prop changes are pushed via effects below) ──

    const engineRef = useRef(null)
    if (!engineRef.current) {
        const editorOpts = {
            onAutocomplete,
            onKeyDiscovery,
            debounceMs,
            parameters,
            onLoadingChange: (loading) => {
                setIsLoading(loading)
            },
        }
        if (registry) {
            editorOpts.registry = registry
        }
        engineRef.current = new EditorEngine(columns, editorOpts)
    }
    const engine = engineRef.current

    // ── Instance ID for unique ARIA references ──

    const instanceIdRef = useRef(null)
    if (!instanceIdRef.current) {
        instanceIdRef.current = 'flyql-' + Math.random().toString(36).substring(2, 8)
    }
    const instanceId = instanceIdRef.current

    const isValueContext = context?.expecting === 'value'

    function highlightMatch(label, originalLabel = null) {
        return engine.highlightMatch(label, originalLabel)
    }

    const shouldShowInfo = (() => {
        const info = selectedInfo
        if (!info) return false
        if (info.infoKind === 'transformer' || info.infoKind === 'renderer') return true
        const item = suggestions[selectedIndex]
        const shortened = item && item.displayLabel && item.displayLabel !== item.label
        return shortened || labelWasTruncated(info.label) || !!info.description
    })()

    function setActivated(val) {
        setActivatedState(val)
        activatedRef.current = val
        engine.state.setActivated(val)
        if (!val) {
            engine.clearKeyCache()
        }
    }

    function _publishDiagnostics(opts = {}) {
        engine.getDiagnostics(opts)
        filterColumnValueDiagnostics()
        setDiagnostics(engine.diagnostics)
        onDiagnostics?.(engine.diagnostics)
    }

    function scheduleDiagnostics() {
        if (diagTimerRef.current) clearTimeout(diagTimerRef.current)
        if (diagIdleTimerRef.current) clearTimeout(diagIdleTimerRef.current)
        diagTimerRef.current = setTimeout(() => {
            diagTimerRef.current = null
            _publishDiagnostics()
        }, DIAG_DEBOUNCE_MS)
        diagIdleTimerRef.current = setTimeout(() => {
            diagIdleTimerRef.current = null
            _publishDiagnostics({ includeEof: true })
        }, DIAG_IDLE_MS)
    }

    function flushDiagnostics() {
        if (diagTimerRef.current) {
            clearTimeout(diagTimerRef.current)
            diagTimerRef.current = null
        }
        if (diagIdleTimerRef.current) {
            clearTimeout(diagIdleTimerRef.current)
            diagIdleTimerRef.current = null
        }
        _publishDiagnostics()
    }

    function filterColumnValueDiagnostics() {
        const ta = textareaRef.current
        if (!ta) return
        const ctx0 = engine.buildContext(ta.value.substring(0, ta.selectionStart))
        if (ctx0 && ctx0.expecting === 'value') {
            const columnValueCodes = new Set(['unknown_column_value', 'invalid_column_value'])
            if (engine.activeTab === 'values') {
                engine.diagnostics = engine.diagnostics.filter((d) => !columnValueCodes.has(d.code))
            } else {
                const colNames = Object.keys(engine.columns.columns).filter(
                    (n) => engine.columns.columns[n]?.suggest !== false,
                )
                engine.diagnostics = engine.diagnostics.filter((d) => {
                    if (!columnValueCodes.has(d.code)) return true
                    const val = (ctx0.value || '').toLowerCase()
                    if (!val) return false
                    return !colNames.some((n) => n.toLowerCase().startsWith(val))
                })
            }
        }
    }

    function switchTab(tab) {
        engine.setTab(tab)
        flushDiagnostics()
        syncFromEngine()
    }

    // ── Sync engine state to React state ──

    function syncFromEngine() {
        setSuggestions(engine.suggestions)
        setSelectedIndex(engine.state.selectedIndex)
        setIsLoading(engine.isLoading)
        suggestionTypeRef.current = engine.suggestionType
        setMessage(engine.message)
        setContext(engine.context)
        contextRef.current = engine.context
        setActiveTab(engine.activeTab)
        // diagnostics state is managed by schedule/flushDiagnostics (debounced).
        // Don't sync here — would defeat the delay on typing paths.
        setSelectedInfo(engine.getSelectedInfo())

        const currentError = engine.getParseError()
        if (currentError !== lastParseErrorRef.current) {
            lastParseErrorRef.current = currentError
            onParseError?.(currentError)
        }
    }

    // ── Highlighting ──

    const highlightedHtml = useMemo(
        () => engine.getHighlightTokens(value, diagnostics, hoveredDiagIndex),
        [engine, value, diagnostics, hoveredDiagIndex],
    )

    // ── Panel Positioning ──

    function updatePanelPosition(ctx) {
        const ta = textareaRef.current
        if (!ta || !ctx) return

        const range = engine.getInsertRange(ctx, ta.value)
        const textBeforeToken = ta.value.substring(0, range.start)

        const mirror = document.createElement('div')
        const style = getComputedStyle(ta)

        mirror.style.position = 'absolute'
        mirror.style.visibility = 'hidden'
        mirror.style.whiteSpace = 'pre-wrap'
        mirror.style.wordWrap = 'break-word'
        mirror.style.overflowWrap = 'break-word'
        mirror.style.width = style.width
        mirror.style.fontFamily = style.fontFamily
        mirror.style.fontSize = style.fontSize
        mirror.style.lineHeight = style.lineHeight
        mirror.style.padding = style.padding
        mirror.style.border = style.border
        mirror.style.boxSizing = style.boxSizing
        mirror.style.letterSpacing = style.letterSpacing
        mirror.style.tabSize = style.tabSize

        const textNode = document.createTextNode(textBeforeToken)
        const span = document.createElement('span')
        span.textContent = '|'

        mirror.appendChild(textNode)
        mirror.appendChild(span)
        document.body.appendChild(mirror)

        try {
            const spanRect = span.getBoundingClientRect()
            const mirrorRect = mirror.getBoundingClientRect()
            const taRect = ta.getBoundingClientRect()
            const cursorLeft = taRect.left + (spanRect.left - mirrorRect.left) - ta.scrollLeft
            const panelWidth = panelRef.current?.offsetWidth || 600
            const viewportWidth = document.documentElement.clientWidth
            if (cursorLeft + panelWidth > viewportWidth) {
                setPanelLeft(Math.max(0, cursorLeft - panelWidth))
            } else {
                setPanelLeft(cursorLeft)
            }
            const panelHeight = panelRef.current?.offsetHeight || 280
            const spaceBelow = window.innerHeight - taRect.bottom - 4
            if (spaceBelow < panelHeight && taRect.top > panelHeight) {
                setPanelTop(taRect.top - panelHeight - 4)
            } else {
                setPanelTop(taRect.bottom + 4)
            }
        } finally {
            document.body.removeChild(mirror)
        }
    }

    // ── Event Handlers ──

    async function triggerSuggestions() {
        const ta = textareaRef.current
        if (!ta) return
        engine.setQuery(ta.value)
        engine.setCursorPosition(ta.selectionStart)

        // Debounce diagnostic visual output on the typing path.
        scheduleDiagnostics()
        syncFromEngine()

        try {
            const promise = engine.updateSuggestions()
            syncFromEngine()
            const ctx = await promise
            syncFromEngine()
            defer(() => {
                updatePanelPosition(ctx)
            })
        } catch {
            syncFromEngine()
        }
    }

    function onCursorMove() {
        setActivated(true)
        defer(() => {
            triggerSuggestions()
        })
    }

    function handleInput(e) {
        setActivated(true)
        const newValue = e.target.value
        onChange?.(newValue)
        if (engine.state.composing) return
        defer(() => {
            autoResize()
            triggerSuggestions()
        })
    }

    function onCompositionEnd(e) {
        engine.state.composing = false
        const newValue = e.target.value
        onChange?.(newValue)
        defer(() => {
            triggerSuggestions()
        })
    }

    function onPaste() {
        setActivated(true)
        defer(() => {
            autoResize()
            triggerSuggestions()
        })
    }

    function onKeydown(e) {
        if (e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault()
            if (suggestions.length > 0) {
                const len = suggestions.length
                let idx = engine.state.selectedIndex
                idx = e.key === 'PageUp' ? Math.max(0, idx - 10) : Math.min(len - 1, idx + 10)
                engine.state.selectedIndex = idx
                setSelectedIndex(idx)
            }
            return
        }
        if (suggestions.length > 0) {
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                engine.navigateUp()
                setSelectedIndex(engine.state.selectedIndex)
                return
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                engine.navigateDown()
                setSelectedIndex(engine.state.selectedIndex)
                return
            }
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault()
                acceptSuggestion(engine.state.selectedIndex)
                return
            }

            // When column suggestions are showing and user types an operator character,
            // accept the column and insert the operator with spaces
            if (suggestionTypeRef.current === 'column' && '=><~'.includes(e.key) && e.key.length === 1) {
                e.preventDefault()
                acceptSuggestion(engine.state.selectedIndex)
                defer(() => {
                    const ta = textareaRef.current
                    if (ta) {
                        const pos = ta.selectionStart
                        const before = ta.value.substring(0, pos)
                        const after = ta.value.substring(pos)
                        // Remove trailing space that acceptSuggestion added, then insert ' op '
                        const trimmed = before.endsWith(' ') ? before.slice(0, -1) : before
                        ta.value = trimmed + ' ' + e.key + ' ' + after
                        const newPos = trimmed.length + 3
                        ta.selectionStart = newPos
                        ta.selectionEnd = newPos
                        onChange?.(ta.value)
                        autoResize()
                        triggerSuggestions()
                    }
                })
                return
            }
        }

        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault()
            return
        }

        if (e.key === 'Escape') {
            e.preventDefault()
            setActivated(false)
            return
        }

        if (e.key === 'Tab') {
            if (activated && engine.context?.expecting === 'value') {
                e.preventDefault()
                engine.cycleTab()
                flushDiagnostics()
                syncFromEngine()
            } else if (activated && suggestions.length > 0) {
                e.preventDefault()
                acceptSuggestion(engine.state.selectedIndex)
            } else if (!activated) {
                e.preventDefault()
                setActivated(true)
                triggerSuggestions()
            }
            return
        }

        if (e.key === 'Home') {
            e.preventDefault()
            const ta = textareaRef.current
            if (ta) {
                ta.selectionStart = 0
                if (!e.shiftKey) ta.selectionEnd = 0
            }
            defer(() => {
                triggerSuggestions()
            })
            return
        }

        if (e.key === 'End') {
            e.preventDefault()
            const ta = textareaRef.current
            if (ta) {
                const len = ta.value.length
                ta.selectionEnd = len
                if (!e.shiftKey) ta.selectionStart = len
            }
            defer(() => {
                triggerSuggestions()
            })
            return
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            defer(() => {
                triggerSuggestions()
            })
            return
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            onSubmit?.()
            return
        }
        if (e.shiftKey && e.key === 'Enter') {
            // Insert newline for multiline query support (AC #4)
            // Do not preventDefault — let the browser insert the newline naturally
            defer(() => {
                autoResize()
                triggerSuggestions()
            })
            return
        }
    }

    function acceptSuggestion(index) {
        const suggestion = engine.selectSuggestion(index)
        if (!suggestion) return

        const ta = textareaRef.current
        if (!ta) return

        const currentValue = ta.value
        const selectionEnd = ta.selectionEnd

        const ctx = engine.context || engine.buildContext(currentValue.substring(0, ta.selectionStart))
        const range = engine.getInsertRange(ctx, currentValue)

        if (selectionEnd > range.end) {
            range.end = selectionEnd
        }
        let insertText = suggestion.insertText

        // Pipe must attach directly to column — consume any preceding whitespace
        if (suggestion.type === 'transformer' && suggestion.label === '|') {
            while (range.start > 0 && currentValue[range.start - 1] === ' ') {
                range.start--
            }
        }

        // Bool ops (and/or/not) require whitespace separation from a preceding
        // token. When accepting right after `]`, `)`, `"`, etc. (no trailing
        // space yet), prepend one so we get `…] and ` not `…]and `.
        if (suggestion.type === 'boolOp') {
            const charBefore = range.start > 0 ? currentValue[range.start - 1] : ''
            if (charBefore && charBefore !== ' ' && charBefore !== '\t' && charBefore !== '\n') {
                insertText = ' ' + insertText
            }
        }

        if (
            !suggestion.cursorOffset &&
            !insertText.endsWith(' ') &&
            !insertText.endsWith('.') &&
            suggestion.type !== 'transformer'
        ) {
            const charAfter = currentValue[range.end] || ''
            if (charAfter === ' ') {
                range.end += 1
                insertText += ' '
            } else {
                insertText += ' '
            }
        }

        insertAtSelection(ta, range, insertText)

        let newCursorPos = range.start + insertText.length
        if (suggestion.cursorOffset) {
            newCursorPos = range.start + insertText.length + suggestion.cursorOffset
            ta.setSelectionRange(newCursorPos, newCursorPos)
        }
        const newValue = ta.value

        engine.setQuery(newValue)
        engine.setCursorPosition(newCursorPos)

        flushDiagnostics()
        syncFromEngine()

        if (engine.diagnostics.length > 0) {
            engine.suggestions = []
            engine.message = ''
            engine.suggestionType = ''
            syncFromEngine()
        } else {
            engine
                .updateSuggestions()
                .then((nextCtx) => {
                    syncFromEngine()
                    defer(() => {
                        updatePanelPosition(nextCtx)
                    })
                })
                .catch(() => {
                    syncFromEngine()
                })
        }

        onChange?.(newValue)

        defer(() => {
            autoResize()
        })
    }

    function onSuggestionSelect(index) {
        acceptSuggestion(index)
        textareaRef.current?.focus()
    }

    function onScroll() {
        const ta = textareaRef.current
        const hl = highlightRef.current
        if (ta && hl) {
            hl.scrollTop = ta.scrollTop
            hl.scrollLeft = ta.scrollLeft
        }
    }

    function handleFocus() {
        setFocused(true)
        focusedRef.current = true
        engine.state.setFocused(true)
        onFocus?.()
    }

    function handleBlur() {
        if (panelInteractingRef.current) return
        setFocused(false)
        focusedRef.current = false
        setActivated(false)
        engine.state.setFocused(false)
        // The user has stopped typing — surface any pending diagnostics immediately.
        flushDiagnostics()
        onBlur?.()
    }

    function autoResize() {
        const ta = textareaRef.current
        const hl = highlightRef.current
        if (!ta) return
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
        if (hl) {
            hl.style.height = ta.scrollHeight + 'px'
        }
    }

    function setItemRef(el, index) {
        if (el) {
            itemRefs.current[index] = el
        } else {
            delete itemRefs.current[index]
        }
    }

    // ── Effects (mirror Vue watchers) ──

    useEffect(() => {
        setSelectedInfo(engine.getSelectedInfo())
        const el = itemRefs.current[selectedIndex]
        if (el) {
            el.scrollIntoView({ block: 'nearest' })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIndex])

    useEffect(() => {
        // Programmatic value changes (presets, resets) bypass the input path —
        // keep the engine in sync so diagnostics/status read the current query.
        if (value !== engine.state.query) {
            engine.setQuery(value)
        }
        autoResize()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.setColumns(columns)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columns])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.debounceMs = debounceMs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debounceMs])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.setParameters(parameters)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parameters])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.onAutocomplete = onAutocomplete || null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onAutocomplete])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.onKeyDiscovery = onKeyDiscovery || null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onKeyDiscovery])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.setRegistry(registry)
        flushDiagnostics()
        syncFromEngine()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registry])

    useEffect(() => {
        mountedRef.current = true
        autoResize()
        const onWindowScroll = () => {
            if (focusedRef.current && activatedRef.current && contextRef.current) {
                updatePanelPosition(contextRef.current)
            }
        }
        window.addEventListener('scroll', onWindowScroll, true)
        if (autofocus) {
            defer(() => {
                textareaRef.current?.focus()
            })
        }
        return () => {
            setActivated(false)
            window.removeEventListener('scroll', onWindowScroll, true)
            // Pending debounced diagnostics must not fire (and call consumer
            // callbacks) after unmount.
            if (diagTimerRef.current) {
                clearTimeout(diagTimerRef.current)
                diagTimerRef.current = null
            }
            if (diagIdleTimerRef.current) {
                clearTimeout(diagIdleTimerRef.current)
                diagIdleTimerRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Public API ──

    useImperativeHandle(ref, () => ({
        focus: () => textareaRef.current?.focus(),
        blur: () => textareaRef.current?.blur(),
        getQueryStatus: () => {
            engine.setQuery(value)
            return engine.getQueryStatus()
        },
        flushDiagnostics,
    }))

    // ── Render ──

    const panel =
        focused && activated
            ? createPortal(
                  <div
                      ref={panelRef}
                      className={'flyql-panel' + (dark ? ' flyql-dark' : '')}
                      onMouseDown={(e) => e.preventDefault()}
                      style={{ left: panelLeft + 'px', top: panelTop + 'px' }}
                  >
                      {debug && (
                          <div className="flyql-panel__header flyql-panel__debug">
                              {context ? (
                                  <span>
                                      state={context.state} expecting={context.expecting} key={context.key} value=
                                      {context.value} op={context.keyValueOperator}
                                  </span>
                              ) : (
                                  <span>no context</span>
                              )}
                              <button
                                  className="flyql-panel__clear"
                                  title="Close suggestions"
                                  onClick={() => setActivated(false)}
                              >
                                  <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                  >
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                              </button>
                          </div>
                      )}
                      <div className={'flyql-panel__loader' + (isLoading ? ' flyql-panel__loader--active' : '')}></div>
                      <div
                          className={
                              'flyql-panel__header' +
                              (isValueContext && activated ? ' flyql-panel__header--with-toggle' : '')
                          }
                      >
                          <span className={isValueContext && activated ? 'flyql-panel__header-label' : undefined}>
                              Suggestions
                          </span>
                          {isValueContext && activated && (
                              <span className="flyql-panel__toggle">
                                  <span className="flyql-panel__toggle-hint">
                                      <span className="flyql-panel__toggle-hint-icon">⇥</span> tab to switch
                                  </span>
                                  <span className="flyql-panel__toggle-group" role="tablist">
                                      <button
                                          role="tab"
                                          aria-selected={activeTab === 'values'}
                                          className={
                                              'flyql-panel__toggle-btn flyql-panel__toggle-btn--values' +
                                              (activeTab === 'values' ? ' flyql-panel__toggle-btn--active' : '')
                                          }
                                          onMouseDown={(e) => {
                                              e.preventDefault()
                                              switchTab('values')
                                          }}
                                      >
                                          Values
                                      </button>
                                      <button
                                          role="tab"
                                          aria-selected={activeTab === 'columns'}
                                          className={
                                              'flyql-panel__toggle-btn flyql-panel__toggle-btn--columns' +
                                              (activeTab === 'columns' ? ' flyql-panel__toggle-btn--active' : '')
                                          }
                                          onMouseDown={(e) => {
                                              e.preventDefault()
                                              switchTab('columns')
                                          }}
                                      >
                                          Columns
                                      </button>
                                  </span>
                              </span>
                          )}
                      </div>
                      <div className="flyql-panel__body" aria-live="polite">
                          {suggestions.length > 0 && (
                              <ul className="flyql-panel__list" role="listbox">
                                  {suggestions.map((item, index) => (
                                      <li
                                          key={index}
                                          id={instanceId + '-suggestion-' + index}
                                          ref={(el) => setItemRef(el, index)}
                                          className={
                                              'flyql-panel__item' +
                                              (index === selectedIndex ? ' flyql-panel__item--active' : '')
                                          }
                                          aria-selected={index === selectedIndex}
                                          role="option"
                                          onClick={() => onSuggestionSelect(index)}
                                      >
                                          <span className={'flyql-panel__badge flyql-panel__badge--' + item.type}>
                                              {badgeText(item.type)}
                                          </span>
                                          <span
                                              className="flyql-panel__label"
                                              dangerouslySetInnerHTML={{
                                                  __html: highlightMatch(
                                                      item.displayLabel || truncateLabel(item.label),
                                                      item.label,
                                                  ),
                                              }}
                                          ></span>
                                          {item.detail && (
                                              <span className={'flyql-panel__detail flyql-panel__detail--' + item.type}>
                                                  {item.detail}
                                              </span>
                                          )}
                                      </li>
                                  ))}
                              </ul>
                          )}
                          {isLoading && suggestions.length === 0 && !message && (
                              <div className="flyql-panel__skeleton">
                                  {[1, 2, 3, 4, 5, 6].map((n) => (
                                      <div key={n} className="flyql-panel__skeleton-row">
                                          <span className="flyql-panel__skeleton-badge"></span>
                                          <span
                                              className="flyql-panel__skeleton-text"
                                              style={{ width: 40 + ((n * 17) % 45) + '%' }}
                                          ></span>
                                      </div>
                                  ))}
                              </div>
                          )}
                          {!isLoading && suggestions.length === 0 && message && (
                              <div className="flyql-panel__message">{message}</div>
                          )}
                          {!isLoading && suggestions.length === 0 && !message && (
                              <div className="flyql-panel__empty">No suggestions</div>
                          )}
                      </div>
                      {diagnostics.length > 0 && (
                          <div
                              className="flyql-panel__diagnostics"
                              onMouseDown={(e) => {
                                  e.stopPropagation()
                                  panelInteractingRef.current = true
                              }}
                              onMouseUp={() => {
                                  panelInteractingRef.current = false
                              }}
                          >
                              <div className="flyql-panel__header">Diagnostics</div>
                              {diagnostics.map((diag, idx) => (
                                  <div
                                      key={idx}
                                      className={
                                          'flyql-panel__diagnostic-item flyql-panel__diagnostic-item--' + diag.severity
                                      }
                                      onMouseEnter={() => setHoveredDiagIndex(idx)}
                                      onMouseLeave={() => setHoveredDiagIndex(-1)}
                                  >
                                      <span
                                          className={
                                              'flyql-panel__diagnostic-bullet flyql-panel__diagnostic-bullet--' +
                                              diag.severity
                                          }
                                      ></span>
                                      <div className="flyql-panel__diagnostic-body">
                                          <span className="flyql-panel__diagnostic-msg">{diag.message}</span>
                                          {diag.error && diag.error.description && (
                                              <span className="flyql-panel__diagnostic-desc">
                                                  {diag.error.description}
                                              </span>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                      {shouldShowInfo && (
                          <div
                              className="flyql-panel__info"
                              onMouseDown={(e) => {
                                  e.stopPropagation()
                                  panelInteractingRef.current = true
                              }}
                              onMouseUp={() => {
                                  panelInteractingRef.current = false
                              }}
                          >
                              <div className="flyql-panel__header">
                                  {selectedInfo.infoKind === 'column'
                                      ? 'Column info'
                                      : selectedInfo.infoKind === 'transformer'
                                        ? 'Transformer info'
                                        : 'Info'}
                              </div>
                              <div className="flyql-panel__footer">
                                  {selectedInfo.infoKind === 'transformer' ? (
                                      <>
                                          <div className="flyql-panel__footer-row">
                                              <span className="flyql-panel__footer-signature">
                                                  {selectedInfo.label}({signatureArgs(selectedInfo.args)})
                                              </span>
                                              <span className="flyql-panel__footer-types">
                                                  {selectedInfo.inputType} → {selectedInfo.outputType}
                                              </span>
                                          </div>
                                          {selectedInfo.description && (
                                              <div className="flyql-panel__footer-desc">{selectedInfo.description}</div>
                                          )}
                                      </>
                                  ) : (
                                      <>
                                          <div className="flyql-panel__footer-row">
                                              <span
                                                  className="flyql-panel__footer-path"
                                                  dangerouslySetInnerHTML={{
                                                      __html: highlightMatch(selectedInfo.label),
                                                  }}
                                              ></span>
                                          </div>
                                          {selectedInfo.description && (
                                              <div className="flyql-panel__footer-desc">{selectedInfo.description}</div>
                                          )}
                                      </>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>,
                  document.body,
              )
            : null

    // Prefix slot (icon + label). `icon`: null/true renders the built-in glyph,
    // `false` drops the icon entirely, a function is called as a render prop,
    // and any other node is rendered as-is.
    const showIcon = icon !== false
    const showLabel = label !== null && label !== undefined && label !== false && label !== ''
    // A visible text label is the field's accessible name; a node label falls
    // back to the generic one, since its rendered text is not readable here.
    const inputAriaLabel = typeof label === 'string' && label ? label : 'FlyQL query input'
    const iconNode =
        icon === null || icon === true ? (
            <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle cx="11" cy="12" r="8" />
                <line x1="21" y1="22" x2="16.65" y2="17.65" />
            </svg>
        ) : typeof icon === 'function' ? (
            icon()
        ) : (
            icon
        )

    return (
        <div className={'flyql-editor' + (focused ? ' flyql-editor--focused' : '') + (dark ? ' flyql-dark' : '')}>
            {(showIcon || showLabel) && (
                <span
                    className="flyql-editor__prefix"
                    onMouseDown={(e) => {
                        e.preventDefault()
                        textareaRef.current?.focus()
                    }}
                >
                    {showIcon && <span className="flyql-editor__icon">{iconNode}</span>}
                    {showLabel && <span className="flyql-editor__label">{label}</span>}
                </span>
            )}
            <div className="flyql-editor__container" ref={containerRef}>
                <pre
                    className="flyql-editor__highlight"
                    ref={highlightRef}
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    aria-hidden="true"
                ></pre>
                <textarea
                    className="flyql-editor__input"
                    ref={textareaRef}
                    rows="1"
                    value={value}
                    placeholder={placeholder}
                    onChange={handleInput}
                    onKeyDown={onKeydown}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onScroll={onScroll}
                    onClick={onCursorMove}
                    onPaste={onPaste}
                    onCompositionStart={() => {
                        engine.state.composing = true
                    }}
                    onCompositionEnd={onCompositionEnd}
                    spellCheck="false"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    aria-label={inputAriaLabel}
                    role="combobox"
                    aria-expanded={focused && activated && suggestions.length > 0}
                    aria-activedescendant={
                        focused && activated && suggestions.length > 0
                            ? instanceId + '-suggestion-' + selectedIndex
                            : undefined
                    }
                ></textarea>
            </div>
            {panel}
        </div>
    )
})

export { FlyqlEditor }
export default FlyqlEditor
