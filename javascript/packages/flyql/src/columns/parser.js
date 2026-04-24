import { Char } from './char.js'
import { State } from './state.js'
import { ParserError } from './exceptions.js'
import { ESCAPE_SEQUENCES, DOUBLE_QUOTE, SINGLE_QUOTE, VALID_ALIAS_OPERATOR, CharType } from './constants.js'
import { Range } from '../core/range.js'

// Strict numeric classifiers for unquoted transformer/renderer arguments.
// Deliberately stricter than parseInt / parseFloat so that values like
// '2abc', 'Infinity', '1e5', '.5' fall through to the field-reference branch.
const INT_RE = /^-?\d+$/
const FLOAT_RE = /^-?(?:\d+\.\d+|\d+\.|\.\d+)$/
import {
    COLUMNS_ERR_EXPECTED_CLOSING_PAREN,
    COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS,
    COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR,
    COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN,
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER,
    COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR,
    COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
    COLUMNS_ERR_INVALID_CHAR_IN_COLUMN,
    COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER,
    COLUMNS_ERR_RENDERER_REQUIRES_ALIAS,
    COLUMNS_ERR_RENDERERS_NOT_ENABLED,
    COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED,
    COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
    COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR,
    COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST,
    COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG,
    COLUMNS_PARSER_REGISTRY,
} from '../errors_generated.js'

export class Parser {
    constructor(capabilities) {
        const defaults = { transformers: false, renderers: false }
        this.capabilities = capabilities ? { ...defaults, ...capabilities } : { ...defaults }
        this.line = 0
        this.linePos = 0
        this.char = null
        this.state = State.EXPECT_COLUMN
        this.errorText = ''
        this.errno = 0
        this.column = ''
        this.alias = ''
        this.aliasOperator = ''
        this.transformer = ''
        this.transformerArgument = ''
        this.transformerArgumentType = 'auto'
        this.transformers = []
        this.transformerArguments = []
        this.renderer = ''
        this.rendererArgument = ''
        this.rendererArgumentType = 'auto'
        this.renderers = []
        this.rendererArguments = []
        this.columns = []
        this.text = ''
        this.typedChars = []
        this._columnStart = -1
        this._transformerStart = -1
        this._transformerArgStart = -1
        this._transformerArgRanges = []
        this._transformerArgKinds = []
        this._rendererStart = -1
        this._rendererArgStart = -1
        this._rendererArgRanges = []
        this._rendererArgKinds = []
    }

    _reclassifyTypedChars(startPos, endPos, charType) {
        for (let k = this.typedChars.length - 1; k >= 0; k--) {
            const entry = this.typedChars[k]
            const pos = entry[0].pos
            if (pos < startPos) break
            if (pos < endPos) {
                entry[1] = charType
            }
        }
    }

    trackChar(charType) {
        if (this.char) {
            this.typedChars.push([this.char, charType])
        }
    }

    setText(text) {
        this.text = text
    }

    storeColumn() {
        const nameRange =
            this._columnStart >= 0 ? new Range(this._columnStart, this._columnStart + this.column.length) : null
        this.columns.push({
            name: this.column,
            transformers: this.transformers,
            renderers: [...this.renderers],
            alias: this.alias || null,
            nameRange,
        })
        this.resetData()
    }

    storeTransformer() {
        const nameRange =
            this._transformerStart >= 0
                ? new Range(this._transformerStart, this._transformerStart + this.transformer.length)
                : null
        this.transformers.push({
            name: this.transformer,
            arguments: this.transformerArguments,
            nameRange,
            argumentRanges: this._transformerArgRanges,
            argumentKinds: this._transformerArgKinds,
        })
        this.resetTransformer()
    }

    storeArgument() {
        const raw = this.transformerArgument
        let value = raw
        let kind
        if (this.transformerArgumentType === 'str') {
            kind = 'str'
        } else if (INT_RE.test(raw)) {
            value = parseInt(raw, 10)
            kind = 'int'
        } else if (FLOAT_RE.test(raw)) {
            value = parseFloat(raw)
            kind = 'float'
        } else {
            kind = 'col'
        }
        this.transformerArguments.push(value)
        this._transformerArgKinds.push(kind)
        if (this._transformerArgStart >= 0) {
            let end
            if (kind === 'str') {
                // Quoted argument: end after closing quote (char.pos is closing quote)
                end = this.char ? this.char.pos + 1 : this._transformerArgStart + raw.length + 2
            } else {
                end = this._transformerArgStart + raw.length
            }
            this._transformerArgRanges.push(new Range(this._transformerArgStart, end))
            if (kind === 'int' || kind === 'float') {
                this._reclassifyTypedChars(this._transformerArgStart, end, CharType.ARGUMENT_NUMBER)
            } else if (kind === 'col') {
                this._reclassifyTypedChars(this._transformerArgStart, end, CharType.ARGUMENT_COLUMN)
            }
        }
        this.resetTransformerArgument()
    }

    storeRenderer() {
        const nameRange =
            this._rendererStart >= 0 ? new Range(this._rendererStart, this._rendererStart + this.renderer.length) : null
        this.renderers.push({
            name: this.renderer,
            arguments: this.rendererArguments,
            nameRange,
            argumentRanges: this._rendererArgRanges,
            argumentKinds: this._rendererArgKinds,
        })
        this.resetRenderer()
    }

    storeRendererArgument() {
        const raw = this.rendererArgument
        let value = raw
        let kind
        if (this.rendererArgumentType === 'str') {
            kind = 'str'
        } else if (INT_RE.test(raw)) {
            value = parseInt(raw, 10)
            kind = 'int'
        } else if (FLOAT_RE.test(raw)) {
            value = parseFloat(raw)
            kind = 'float'
        } else {
            kind = 'col'
        }
        this.rendererArguments.push(value)
        this._rendererArgKinds.push(kind)
        if (this._rendererArgStart >= 0) {
            let end
            if (kind === 'str') {
                end = this.char ? this.char.pos + 1 : this._rendererArgStart + raw.length + 2
            } else {
                end = this._rendererArgStart + raw.length
            }
            this._rendererArgRanges.push(new Range(this._rendererArgStart, end))
            if (kind === 'int' || kind === 'float') {
                this._reclassifyTypedChars(this._rendererArgStart, end, CharType.ARGUMENT_NUMBER)
            } else if (kind === 'col') {
                this._reclassifyTypedChars(this._rendererArgStart, end, CharType.ARGUMENT_COLUMN)
            }
        }
        this.resetRendererArgument()
    }

    resetRenderer() {
        this.renderer = ''
        this.rendererArguments = []
        this.rendererArgument = ''
        this._rendererStart = -1
        this._rendererArgStart = -1
        this._rendererArgRanges = []
        this._rendererArgKinds = []
    }

    resetRenderers() {
        this.renderers = []
    }

    resetRendererArgument() {
        this.rendererArgument = ''
        this.rendererArgumentType = 'auto'
        this._rendererArgStart = -1
    }

    extendRenderer() {
        if (this.char) {
            if (this._rendererStart < 0) {
                this._rendererStart = this.char.pos
            }
            this.renderer += this.char.value
            this.trackChar(CharType.RENDERER)
        }
    }

    extendRendererArgument(charType = CharType.RENDERER_ARGUMENT) {
        if (this.char) {
            if (this._rendererArgStart < 0) {
                this._rendererArgStart = this.char.pos
            }
            this.rendererArgument += this.char.value
            this.trackChar(charType)
        }
    }

    setChar(char) {
        this.char = char
    }

    setState(state) {
        this.state = state
    }

    resetTransformer() {
        this.transformer = ''
        this.transformerArguments = []
        this.transformerArgument = ''
        this._transformerStart = -1
        this._transformerArgStart = -1
        this._transformerArgRanges = []
        this._transformerArgKinds = []
    }

    resetColumn() {
        this.column = ''
    }

    resetAliasOperator() {
        this.aliasOperator = ''
    }

    resetAlias() {
        this.alias = ''
    }

    resetTransformers() {
        this.transformers = []
    }

    resetTransformerArgument() {
        this.transformerArgument = ''
        this.transformerArgumentType = 'auto'
        this._transformerArgStart = -1
    }

    resetData() {
        this.resetColumn()
        this.resetAlias()
        this.resetTransformer()
        this.resetTransformers()
        this.resetRenderer()
        this.resetRenderers()
        this.resetAliasOperator()
        this._columnStart = -1
    }

    setErrorState(errorText, errno) {
        this.state = State.ERROR
        this.errorText = errorText
        this.errno = errno
        if (this.char) {
            this.errorText += ` [char ${this.char.value} at pos ${this.char.pos}], errno=${errno}`
        }
    }

    extendColumn() {
        if (this.char) {
            if (this._columnStart < 0) {
                this._columnStart = this.char.pos
            }
            this.column += this.char.value
            this.trackChar(CharType.COLUMN)
        }
    }

    extendTransformer() {
        if (this.char) {
            if (this._transformerStart < 0) {
                this._transformerStart = this.char.pos
            }
            this.transformer += this.char.value
            this.trackChar(CharType.TRANSFORMER)
        }
    }

    extendTransformerArgument(charType = CharType.ARGUMENT) {
        if (this.char) {
            if (this._transformerArgStart < 0) {
                this._transformerArgStart = this.char.pos
            }
            this.transformerArgument += this.char.value
            this.trackChar(charType)
        }
    }

    extendAlias() {
        if (this.char) {
            this.alias += this.char.value
            this.trackChar(CharType.ALIAS)
        }
    }

    extendAliasOperator() {
        if (this.char) {
            this.aliasOperator += this.char.value
        }
    }

    parse(text, raiseError = true, ignoreLastChar = false) {
        this.setText(text)
        this.raiseError = raiseError
        this.ignoreLastChar = ignoreLastChar

        let i = 0
        while (i < text.length) {
            let parsedNewline = false
            if (this.state === State.ERROR) {
                break
            }

            this.setChar(new Char(text[i], i, this.line, this.linePos))

            if (this.char.isBackslash()) {
                if (i + 1 < text.length) {
                    const nextChar = text[i + 1]
                    if (nextChar && ESCAPE_SEQUENCES[nextChar]) {
                        parsedNewline = true
                        this.setChar(new Char(ESCAPE_SEQUENCES[nextChar], i, this.line, this.linePos))
                        i += 1
                    }
                }
            }

            if (this.char.isNewline() && !parsedNewline) {
                this.trackChar(CharType.SPACE)
                this.line += 1
                this.linePos = 0
                i += 1
                continue
            }

            if (this.state === State.EXPECT_COLUMN) {
                this.inStateExpectColumn()
            } else if (this.state === State.COLUMN) {
                this.inStateColumn()
            } else if (this.state === State.EXPECT_ALIAS) {
                this.inStateExpectAlias()
            } else if (this.state === State.EXPECT_ALIAS_OPERATOR) {
                this.inStateExpectAliasOperator()
            } else if (this.state === State.EXPECT_ALIAS_DELIMITER) {
                this.inStateExpectAliasDelimiter()
            } else if (this.state === State.EXPECT_TRANSFORMER) {
                this.inStateExpectTransformer()
            } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT) {
                this.inStateExpectTransformerArgument()
            } else if (this.state === State.TRANSFORMER) {
                this.inStateTransformer()
            } else if (this.state === State.TRANSFORMER_ARGUMENT) {
                this.inStateTransformerArgument()
            } else if (this.state === State.TRANSFORMER_COMPLETE) {
                this.inStateTransformerComplete()
            } else if (this.state === State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED) {
                this.inStateTransformerArgumentDoubleQuoted()
            } else if (this.state === State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED) {
                this.inStateTransformerArgumentSingleQuoted()
            } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER) {
                this.inStateExpectTransformerArgumentDelimiter()
            } else if (this.state === State.EXPECT_RENDERER) {
                this.inStateExpectRenderer()
            } else if (this.state === State.RENDERER) {
                this.inStateRenderer()
            } else if (this.state === State.RENDERER_COMPLETE) {
                this.inStateRendererComplete()
            } else if (this.state === State.EXPECT_RENDERER_ARGUMENT) {
                this.inStateExpectRendererArgument()
            } else if (this.state === State.RENDERER_ARGUMENT) {
                this.inStateRendererArgument()
            } else if (this.state === State.RENDERER_ARGUMENT_DOUBLE_QUOTED) {
                this.inStateRendererArgumentDoubleQuoted()
            } else if (this.state === State.RENDERER_ARGUMENT_SINGLE_QUOTED) {
                this.inStateRendererArgumentSingleQuoted()
            } else if (this.state === State.EXPECT_RENDERER_ARGUMENT_DELIMITER) {
                this.inStateExpectRendererArgumentDelimiter()
            } else {
                throw new Error(`unreachable: unexpected columns parser state ${this.state}`)
            }
            i += 1
            this.linePos += 1
        }

        if (this.state === State.ERROR && this.raiseError) {
            const entry = COLUMNS_PARSER_REGISTRY[this.errno] ?? null
            throw new ParserError(this.errorText, this.errno, entry)
        }

        if (!this.ignoreLastChar) {
            this.inStateLastChar()
        }

        if (this.state === State.ERROR && this.raiseError) {
            const entry = COLUMNS_PARSER_REGISTRY[this.errno] ?? null
            throw new ParserError(this.errorText, this.errno, entry)
        }
    }

    inStateLastChar() {
        if (this.state === State.COLUMN) {
            this.storeColumn()
        } else if (this.state === State.EXPECT_COLUMN) {
            return
        } else if (this.state === State.EXPECT_ALIAS) {
            if (this.alias) {
                this.storeColumn()
            } else {
                this.setErrorState(
                    'unexpected end of alias. Expected alias value',
                    COLUMNS_ERR_UNEXPECTED_END_OF_ALIAS_OPERATOR,
                )
            }
        } else if (this.state === State.EXPECT_ALIAS_OPERATOR) {
            if (this.aliasOperator) {
                this.setErrorState(
                    'unexpected end of alias. Expected alias value',
                    COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
                )
            } else {
                this.storeColumn()
            }
        } else if (this.state === State.EXPECT_ALIAS_DELIMITER) {
            this.setErrorState(
                'unexpected end of alias. Expected alias value',
                COLUMNS_ERR_UNEXPECTED_END_EXPECTED_ALIAS_VALUE,
            )
        } else if (this.state === State.TRANSFORMER) {
            if (this.transformer) {
                this.storeTransformer()
            }
            if (this.column) {
                this.storeColumn()
            }
        } else if (this.state === State.TRANSFORMER_COMPLETE) {
            this.storeTransformer()
            this.storeColumn()
        } else if (
            this.state === State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED ||
            this.state === State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED
        ) {
            this.setErrorState('unexpected end of quoted argument value', COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG)
        } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER) {
            this.setErrorState('unexpected end of arguments list', COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST)
        } else if (this.state === State.EXPECT_TRANSFORMER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', COLUMNS_ERR_EXPECTED_CLOSING_PAREN)
        } else if (this.state === State.TRANSFORMER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', COLUMNS_ERR_EXPECTED_CLOSING_PAREN)
        } else if (this.state === State.EXPECT_TRANSFORMER) {
            this.setErrorState('expected transformer after operator', COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER)
        } else if (this.state === State.RENDERER) {
            if (this.renderer) {
                this.storeRenderer()
            }
            if (this.column) {
                this.storeColumn()
            }
        } else if (this.state === State.RENDERER_COMPLETE) {
            this.storeRenderer()
            this.storeColumn()
        } else if (
            this.state === State.RENDERER_ARGUMENT_DOUBLE_QUOTED ||
            this.state === State.RENDERER_ARGUMENT_SINGLE_QUOTED
        ) {
            this.setErrorState('unexpected end of quoted argument value', COLUMNS_ERR_UNEXPECTED_END_OF_QUOTED_ARG)
        } else if (this.state === State.EXPECT_RENDERER_ARGUMENT_DELIMITER) {
            this.setErrorState('unexpected end of arguments list', COLUMNS_ERR_UNEXPECTED_END_OF_ARGS_LIST)
        } else if (this.state === State.EXPECT_RENDERER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', COLUMNS_ERR_EXPECTED_CLOSING_PAREN)
        } else if (this.state === State.RENDERER_ARGUMENT) {
            this.setErrorState('expected closing parenthesis', COLUMNS_ERR_EXPECTED_CLOSING_PAREN)
        } else if (this.state === State.EXPECT_RENDERER) {
            this.setErrorState('expected renderer after operator', COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER)
        }
    }

    inStateExpectColumn() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        } else if (this.char.isColumnValue()) {
            this.extendColumn()
            this.setState(State.COLUMN)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', COLUMNS_ERR_INVALID_CHAR_EXPECT_COLUMN)
        }
    }

    inStateColumn() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isColumnValue()) {
            this.extendColumn()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_COLUMN)
            this.storeColumn()
        } else if (this.char.isTransformerOperator()) {
            if (!this.capabilities.transformers) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('transformers are not enabled', COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED)
                return
            }
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_TRANSFORMER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', COLUMNS_ERR_INVALID_CHAR_IN_COLUMN)
        }
    }

    inStateExpectTransformer() {
        if (!this.char) return
        if (this.char.isTransformerValue()) {
            this.extendTransformer()
            this.setState(State.TRANSFORMER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character, expected transformer', COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER)
        }
    }

    inStateTransformer() {
        if (!this.char) return
        if (this.char.isTransformerValue()) {
            this.extendTransformer()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isTransformerOperator()) {
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.setState(State.EXPECT_TRANSFORMER)
        } else if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            this.storeTransformer()
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isBracketOpen()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_TRANSFORMER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.storeTransformer()
            throw new Error('unsupported close bracket')
        } else {
            this.trackChar(CharType.ERROR)
            throw new Error('unsupported char in transformer')
        }
    }

    inStateExpectTransformerArgument() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        }
        if (this.char.isDoubleQuote()) {
            this.transformerArgumentType = 'str'
            this._transformerArgStart = this.char.pos
            this.trackChar(CharType.ARGUMENT_STRING)
            this.setState(State.TRANSFORMER_ARGUMENT_DOUBLE_QUOTED)
        } else if (this.char.isSingleQuote()) {
            this.transformerArgumentType = 'str'
            this._transformerArgStart = this.char.pos
            this.trackChar(CharType.ARGUMENT_STRING)
            this.setState(State.TRANSFORMER_ARGUMENT_SINGLE_QUOTED)
        } else if (this.char.isTransformerArgumentValue()) {
            this.extendTransformerArgument()
            this.setState(State.TRANSFORMER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            if (this.transformerArgument) {
                this.storeArgument()
            }
            this.setState(State.TRANSFORMER_COMPLETE)
        }
    }

    inStateTransformerArgument() {
        if (!this.char) return
        if (this.char.isTransformerArgumentDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.setState(State.EXPECT_TRANSFORMER_ARGUMENT)
        } else if (this.char.isTransformerArgumentValue()) {
            this.extendTransformerArgument()
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.storeArgument()
            this.setState(State.TRANSFORMER_COMPLETE)
        }
    }

    inStateExpectTransformerArgumentDelimiter() {
        if (!this.char) return
        if (this.char.isTransformerArgumentDelimiter()) {
            this.setState(State.EXPECT_TRANSFORMER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.setState(State.TRANSFORMER_COMPLETE)
        } else {
            this.setErrorState(
                'invalid character. Expected bracket close or transformer argument delimiter',
                COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
            )
        }
    }

    inStateTransformerArgumentDoubleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== DOUBLE_QUOTE) {
                    this.extendTransformerArgument(CharType.ARGUMENT_STRING)
                }
            } else {
                this.extendTransformerArgument(CharType.ARGUMENT_STRING)
            }
        } else if (this.char.isTransformerDoubleQuotedArgumentValue()) {
            this.extendTransformerArgument(CharType.ARGUMENT_STRING)
        } else if (this.char.isDoubleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendTransformerArgument(CharType.ARGUMENT_STRING)
            } else {
                this.trackChar(CharType.ARGUMENT_STRING)
                this.storeArgument()
                this.setState(State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER)
            }
        } else {
            throw new Error('unreachable: isTransformerXQuotedArgumentValue() is true for every non-quote char')
        }
    }

    inStateTransformerArgumentSingleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== SINGLE_QUOTE) {
                    this.extendTransformerArgument(CharType.ARGUMENT_STRING)
                }
            } else {
                this.extendTransformerArgument(CharType.ARGUMENT_STRING)
            }
        } else if (this.char.isTransformerSingleQuotedArgumentValue()) {
            this.extendTransformerArgument(CharType.ARGUMENT_STRING)
        } else if (this.char.isSingleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendTransformerArgument(CharType.ARGUMENT_STRING)
            } else {
                this.trackChar(CharType.ARGUMENT_STRING)
                this.storeArgument()
                this.setState(State.EXPECT_TRANSFORMER_ARGUMENT_DELIMITER)
            }
        } else {
            throw new Error('unreachable: isTransformerXQuotedArgumentValue() is true for every non-quote char')
        }
    }

    inStateTransformerComplete() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            this.storeTransformer()
            this.setState(State.EXPECT_ALIAS_OPERATOR)
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isTransformerOperator()) {
            if (!this.capabilities.transformers) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('transformers are not enabled', COLUMNS_ERR_TRANSFORMERS_NOT_ENABLED)
                return
            }
            this.trackChar(CharType.OPERATOR)
            this.storeTransformer()
            this.setState(State.EXPECT_TRANSFORMER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS)
        }
    }

    inStateExpectAliasOperator() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isAliasChar()) {
            this.trackChar(CharType.ALIAS_OPERATOR)
            this.extendAliasOperator()
            if (this.aliasOperator.length < 2) {
                return
            }
            if (this.aliasOperator.length === 2) {
                if (this.aliasOperator.toLowerCase() !== VALID_ALIAS_OPERATOR) {
                    this.setErrorState('invalid character', COLUMNS_ERR_INVALID_CHAR_EXPECT_ALIAS_OPERATOR)
                } else {
                    this.setState(State.EXPECT_ALIAS_DELIMITER)
                    this.resetAliasOperator()
                }
            }
        } else {
            this.setErrorState(
                'invalid character, expected alias operator',
                COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_OPERATOR,
            )
        }
    }

    inStateExpectAlias() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        } else if (this.char.isColumnValue()) {
            this.extendAlias()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_COLUMN)
            this.storeColumn()
        } else if (this.char.isTransformerOperator()) {
            if (!this.capabilities.renderers) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('renderers are not enabled', COLUMNS_ERR_RENDERERS_NOT_ENABLED)
                return
            }
            if (!this.alias) {
                this.trackChar(CharType.ERROR)
                this.setErrorState('renderers require an alias', COLUMNS_ERR_RENDERER_REQUIRES_ALIAS)
                return
            }
            this.trackChar(CharType.RENDERER_PIPE)
            this.setState(State.EXPECT_RENDERER)
        }
    }

    inStateExpectAliasDelimiter() {
        if (!this.char) return
        if (this.char.isAliasDelimiter()) {
            this.trackChar(CharType.SPACE)
            this.setState(State.EXPECT_ALIAS)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState(
                'invalid character, expected alias delimiter',
                COLUMNS_ERR_INVALID_CHAR_EXPECTED_ALIAS_DELIMITER,
            )
        }
    }

    inStateExpectRenderer() {
        if (!this.char) return
        if (this.char.isTransformerValue()) {
            this.extendRenderer()
            this.setState(State.RENDERER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character, expected renderer', COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER)
        }
    }

    inStateRenderer() {
        if (!this.char) return
        if (this.char.isTransformerValue()) {
            this.extendRenderer()
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeRenderer()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isTransformerOperator()) {
            this.trackChar(CharType.RENDERER_PIPE)
            this.storeRenderer()
            this.setState(State.EXPECT_RENDERER)
        } else if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            // Do NOT store here — RENDERER_COMPLETE handlers (on ',', '|',
            // or EOF via inStateLastChar) perform the single store. Storing
            // here would create a phantom empty renderer on any subsequent
            // separator.
            this.setState(State.RENDERER_COMPLETE)
        } else if (this.char.isBracketOpen()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_RENDERER_ARGUMENT)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character in renderer name', COLUMNS_ERR_INVALID_TRANSFORMER_OR_RENDERER)
        }
    }

    inStateRendererComplete() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        } else if (this.char.isColumnsDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeRenderer()
            this.storeColumn()
            this.setState(State.EXPECT_COLUMN)
        } else if (this.char.isTransformerOperator()) {
            this.trackChar(CharType.RENDERER_PIPE)
            this.storeRenderer()
            this.setState(State.EXPECT_RENDERER)
        } else {
            this.trackChar(CharType.ERROR)
            this.setErrorState('invalid character', COLUMNS_ERR_INVALID_CHAR_AFTER_ARGS)
        }
    }

    inStateExpectRendererArgument() {
        if (!this.char) return
        if (this.char.isSpace()) {
            this.trackChar(CharType.SPACE)
            return
        }
        if (this.char.isDoubleQuote()) {
            this.rendererArgumentType = 'str'
            this._rendererArgStart = this.char.pos
            this.trackChar(CharType.ARGUMENT_STRING)
            this.setState(State.RENDERER_ARGUMENT_DOUBLE_QUOTED)
        } else if (this.char.isSingleQuote()) {
            this.rendererArgumentType = 'str'
            this._rendererArgStart = this.char.pos
            this.trackChar(CharType.ARGUMENT_STRING)
            this.setState(State.RENDERER_ARGUMENT_SINGLE_QUOTED)
        } else if (this.char.isTransformerArgumentValue()) {
            this.extendRendererArgument()
            this.setState(State.RENDERER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            if (this.rendererArgument) {
                this.storeRendererArgument()
            }
            this.setState(State.RENDERER_COMPLETE)
        }
    }

    inStateRendererArgument() {
        if (!this.char) return
        if (this.char.isTransformerArgumentDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.storeRendererArgument()
            this.setState(State.EXPECT_RENDERER_ARGUMENT)
        } else if (this.char.isTransformerArgumentValue()) {
            this.extendRendererArgument()
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.storeRendererArgument()
            this.setState(State.RENDERER_COMPLETE)
        }
    }

    inStateExpectRendererArgumentDelimiter() {
        if (!this.char) return
        if (this.char.isTransformerArgumentDelimiter()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.EXPECT_RENDERER_ARGUMENT)
        } else if (this.char.isBracketClose()) {
            this.trackChar(CharType.OPERATOR)
            this.setState(State.RENDERER_COMPLETE)
        } else {
            this.setErrorState(
                'invalid character. Expected bracket close or renderer argument delimiter',
                COLUMNS_ERR_INVALID_CHAR_IN_ARGS,
            )
        }
    }

    inStateRendererArgumentDoubleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== DOUBLE_QUOTE) {
                    this.extendRendererArgument(CharType.ARGUMENT_STRING)
                }
            } else {
                this.extendRendererArgument(CharType.ARGUMENT_STRING)
            }
        } else if (this.char.isTransformerDoubleQuotedArgumentValue()) {
            this.extendRendererArgument(CharType.ARGUMENT_STRING)
        } else if (this.char.isDoubleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendRendererArgument(CharType.ARGUMENT_STRING)
            } else {
                this.trackChar(CharType.ARGUMENT_STRING)
                this.storeRendererArgument()
                this.setState(State.EXPECT_RENDERER_ARGUMENT_DELIMITER)
            }
        } else {
            throw new Error('unreachable: isTransformerXQuotedArgumentValue() is true for every non-quote char')
        }
    }

    inStateRendererArgumentSingleQuoted() {
        if (!this.char) return
        if (this.char.isBackslash()) {
            const nextPos = this.char.pos + 1
            if (nextPos < this.text.length) {
                const nextChar = this.text[nextPos]
                if (nextChar !== SINGLE_QUOTE) {
                    this.extendRendererArgument(CharType.ARGUMENT_STRING)
                }
            } else {
                this.extendRendererArgument(CharType.ARGUMENT_STRING)
            }
        } else if (this.char.isTransformerSingleQuotedArgumentValue()) {
            this.extendRendererArgument(CharType.ARGUMENT_STRING)
        } else if (this.char.isSingleQuote()) {
            const prevPos = this.char.pos - 1
            if (this.text[prevPos] === '\\') {
                this.extendRendererArgument(CharType.ARGUMENT_STRING)
            } else {
                this.trackChar(CharType.ARGUMENT_STRING)
                this.storeRendererArgument()
                this.setState(State.EXPECT_RENDERER_ARGUMENT_DELIMITER)
            }
        } else {
            throw new Error('unreachable: isTransformerXQuotedArgumentValue() is true for every non-quote char')
        }
    }
}
