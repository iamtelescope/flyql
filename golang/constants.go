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

// durationUnitMagnitude enforces strictly descending, unique-unit duration
// literals (Prometheus-style): w > d > h > m > s. `1h30m` valid; `30m1h`,
// `1h1h`, `3h1w` all rejected.
var durationUnitMagnitude = map[rune]int{
	's': 1,
	'm': 2,
	'h': 3,
	'd': 4,
	'w': 5,
}
