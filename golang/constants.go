package flyql

const (
	BoolOpAnd = "and"
	BoolOpOr  = "or"
)

const (
	OpEquals          = "="
	OpNotEquals       = "!="
	OpRegex           = "~"
	OpNotRegex        = "!~"
	OpGreater         = ">"
	OpLess            = "<"
	OpGreaterOrEquals = ">="
	OpLessOrEquals    = "<="
	OpTruthy          = "truthy"
	OpIn              = "in"
	OpNotIn           = "not in"
	OpHas             = "has"
	OpNotHas          = "not has"
	OpLike            = "like"
	OpNotLike         = "not like"
	OpILike           = "ilike"
	OpNotILike        = "not ilike"
)

const NotKeyword = "not"
const InKeyword = "in"
const HasKeyword = "has"
const LikeKeyword = "like"
const ILikeKeyword = "ilike"

var knownFunctions = map[string]bool{
	"ago":     true,
	"now":     true,
	"today":   true,
	"startOf": true,
}

const (
	errUnknownFunction                = 70
	errInvalidFunctionArgs            = 71
	errFunctionNotAllowedWithOperator = 72
	errInvalidDuration                = 73
)
