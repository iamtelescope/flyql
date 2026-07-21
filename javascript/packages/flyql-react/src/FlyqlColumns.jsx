import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ColumnsEngine, insertAtSelection, truncateLabel, labelWasTruncated, signatureArgs } from 'flyql/editor'
import './flyql.css'

// Diagnostics are debounced on the typing path so squiggles/panels don't
// flash the moment a keystroke is incomplete. Decisive actions (suggestion
// accept, prop change, blur, external flush) bypass the delay.
//
// A second longer timer (IDLE) re-runs diagnostics with includeEof=true,
// so EOF-suppressed errors (unclosed `(`, `"` …) eventually surface once
// the user truly pauses. Both timers reset on every keystroke.
const DIAG_DEBOUNCE_MS = 400
const DIAG_IDLE_MS = 2000

// Mirror of Vue's nextTick usage: run after the current event/render settles.
const defer = (fn) => setTimeout(fn, 0)

function badgeText(type) {
    switch (type) {
        case 'column':
            return 'C'
        case 'transformer':
            return 'T'
        case 'renderer':
            return 'R'
        case 'delimiter':
            return 'S'
        default:
            return '?'
    }
}

const FlyqlColumns = forwardRef(function FlyqlColumns(
    {
        value = '',
        onChange = null,
        columns = null,
        capabilities = null,
        onKeyDiscovery = null,
        placeholder = '',
        autofocus = false,
        debug = false,
        dark = false,
        registry = null,
        rendererRegistry = null,
        icon = null,
        loading = null,
        onSubmit = null,
        onParseError = null,
        onParsedChange = null,
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
        const engineOpts = {
            onKeyDiscovery,
            onLoadingChange: (loading_) => {
                setIsLoading(loading_)
            },
        }
        if (capabilities) {
            engineOpts.capabilities = capabilities
        }
        if (registry) {
            engineOpts.registry = registry
        }
        if (rendererRegistry) {
            engineOpts.rendererRegistry = rendererRegistry
        }
        engineRef.current = new ColumnsEngine(columns, engineOpts)
    }
    const engine = engineRef.current

    // ── Instance ID for unique ARIA references ──

    const instanceIdRef = useRef(null)
    if (!instanceIdRef.current) {
        instanceIdRef.current = 'flyql-cols-' + Math.random().toString(36).substring(2, 8)
    }
    const instanceId = instanceIdRef.current

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
        if (!val) {
            engine.state.setActivated(false)
            engine.clearKeyCache()
        }
    }

    function _publishDiagnostics(opts = {}) {
        engine.getDiagnostics(opts)
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

    // ── Sync engine state to React state ──

    function syncFromEngine() {
        setSuggestions(engine.suggestions)
        setSelectedIndex(engine.state.selectedIndex)
        setMessage(engine.message)
        setContext(engine.context)
        contextRef.current = engine.context
        // diagnostics state is managed by schedule/flushDiagnostics (debounced).
        // Don't sync here — would defeat the delay on typing paths.
        setSelectedInfo(engine.getSelectedInfo())

        const currentError = engine.getParseError()
        if (currentError !== lastParseErrorRef.current) {
            lastParseErrorRef.current = currentError
            onParseError?.(currentError)
        }
    }

    function emitParsed() {
        const parsed = engine.getParsedColumns()
        onParsedChange?.(parsed)
    }

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
        try {
            const { ctx, seq } = await engine.updateSuggestions()
            if (engine.isStale(seq)) return
            scheduleDiagnostics()
            syncFromEngine()
            defer(() => {
                updatePanelPosition(ctx)
            })
        } catch {
            scheduleDiagnostics()
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
            emitParsed()
        })
    }

    function onCompositionEnd(e) {
        engine.state.composing = false
        const newValue = e.target.value
        onChange?.(newValue)
        defer(() => {
            triggerSuggestions()
            emitParsed()
        })
    }

    function onPaste() {
        setActivated(true)
        defer(() => {
            autoResize()
            triggerSuggestions()
            emitParsed()
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
            if (activated && suggestions.length > 0) {
                e.preventDefault()
                acceptSuggestion(engine.state.selectedIndex)
            } else if (!activated) {
                e.preventDefault()
                setActivated(true)
                triggerSuggestions()
            }
            return
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            onSubmit?.()
            return
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const ta = textareaRef.current
            if (ta) {
                const pos = ta.selectionStart
                const len = ta.value.length
                const newPos = e.key === 'ArrowRight' ? Math.min(pos + 1, len) : Math.max(pos - 1, 0)
                engine.setQuery(ta.value)
                engine.setCursorPosition(newPos)
                engine
                    .updateSuggestions()
                    .then(({ ctx, seq }) => {
                        if (engine.isStale(seq)) return
                        syncFromEngine()
                        defer(() => {
                            updatePanelPosition(ctx)
                        })
                    })
                    .catch(() => {
                        syncFromEngine()
                    })
            }
            return
        }
    }

    function acceptSuggestion(index) {
        const suggestion = engine.selectSuggestion(index)
        if (!suggestion) return

        const ta = textareaRef.current
        if (!ta) return

        const currentValue = ta.value
        // Use engine's tracked cursor — ta.selectionStart can be stale after re-renders
        const cursorPos = engine.state.cursorPosition
        const ctx = engine.buildContext(currentValue.substring(0, cursorPos), currentValue)
        const range = engine.getInsertRange(ctx, currentValue, suggestion)
        const insertText = suggestion.insertText

        insertAtSelection(ta, range, insertText)
        let newCursorPos = range.start + insertText.length
        if (suggestion.cursorOffset) {
            newCursorPos = range.start + insertText.length + suggestion.cursorOffset
            ta.setSelectionRange(newCursorPos, newCursorPos)
        }
        const newValue = ta.value

        // Update engine state
        engine.setQuery(newValue)
        engine.setCursorPosition(newCursorPos)

        onChange?.(newValue)
        emitParsed()

        // Restore cursor after re-render, then update suggestions
        defer(() => {
            const t = textareaRef.current
            if (t) {
                t.selectionStart = newCursorPos
                t.selectionEnd = newCursorPos
            }
            autoResize()
            engine
                .updateSuggestions()
                .then(({ ctx: nextCtx, seq }) => {
                    if (engine.isStale(seq)) return
                    flushDiagnostics()
                    syncFromEngine()
                    defer(() => {
                        updatePanelPosition(nextCtx)
                    })
                })
                .catch(() => {
                    flushDiagnostics()
                    syncFromEngine()
                })
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
        setActivated(true)
        triggerSuggestions()
        onFocus?.()
    }

    function onPanelMousedown(e) {
        // Allow text selection in diagnostics (stopPropagation handles that),
        // prevent blur for everything else
        e.preventDefault()
    }

    function handleBlur() {
        if (panelInteractingRef.current) return
        setFocused(false)
        focusedRef.current = false
        setActivated(false)
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
        // sync the engine first so emitParsed publishes the CURRENT expression.
        if (value !== engine.state.query) {
            engine.setQuery(value)
        }
        autoResize()
        if (mountedRef.current) {
            emitParsed()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.setColumns(columns)
        flushDiagnostics()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columns])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.onKeyDiscovery = onKeyDiscovery || null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onKeyDiscovery])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.setRegistry(registry)
        flushDiagnostics()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registry])

    useEffect(() => {
        if (!mountedRef.current) return
        engine.setRendererRegistry(rendererRegistry)
        flushDiagnostics()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rendererRegistry])

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
        getParsedColumns: () => {
            engine.setQuery(value)
            return engine.getParsedColumns()
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
                      onMouseDown={onPanelMousedown}
                      style={{ left: panelLeft + 'px', top: panelTop + 'px' }}
                  >
                      {debug && (
                          <div className="flyql-panel__header flyql-panel__debug">
                              {context ? (
                                  <span>
                                      state={context.state} expecting={context.expecting} col={context.column} mod=
                                      {context.transformer}
                                  </span>
                              ) : (
                                  <span>no context</span>
                              )}
                          </div>
                      )}
                      <div className="flyql-panel__header">
                          Suggestions
                          {isLoading && suggestions.length > 0 && (
                              <span className="flyql-panel__spinner flyql-panel__spinner--inline"></span>
                          )}
                      </div>
                      <div className="flyql-panel__body" aria-live="polite">
                          {isLoading && suggestions.length === 0 && (
                              <div className="flyql-panel__loading">
                                  {loading !== null ? (
                                      typeof loading === 'function' ? (
                                          loading()
                                      ) : (
                                          loading
                                      )
                                  ) : (
                                      <span className="flyql-panel__spinner"></span>
                                  )}
                              </div>
                          )}
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
                                          {item.detail && <span className="flyql-panel__detail">{item.detail}</span>}
                                      </li>
                                  ))}
                              </ul>
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
                                        : selectedInfo.infoKind === 'renderer'
                                          ? 'Renderer info'
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
                                  ) : selectedInfo.infoKind === 'renderer' ? (
                                      <>
                                          <div className="flyql-panel__footer-row">
                                              <span className="flyql-panel__footer-signature">
                                                  {selectedInfo.label}({signatureArgs(selectedInfo.args)})
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

    return (
        <div className={'flyql-columns' + (focused ? ' flyql-columns--focused' : '') + (dark ? ' flyql-dark' : '')}>
            <span className="flyql-columns__icon">
                {icon !== null ? (
                    typeof icon === 'function' ? (
                        icon()
                    ) : (
                        icon
                    )
                ) : (
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
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                    </svg>
                )}
            </span>
            <div className="flyql-columns__container" ref={containerRef}>
                <pre
                    className="flyql-columns__highlight"
                    ref={highlightRef}
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    aria-hidden="true"
                ></pre>
                <textarea
                    className="flyql-columns__input"
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
                    aria-label="FlyQL columns expression input"
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

export { FlyqlColumns }
export default FlyqlColumns
