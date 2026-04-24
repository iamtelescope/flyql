package flyql

import "github.com/iamtelescope/flyql/golang/flyqltype"

// Type is the canonical flyql semantic type for a column or value.
// This is a re-export of flyqltype.Type so external users write
// flyql.TypeString, flyql.TypeInt, etc. The constants live in the leaf
// flyqltype package to avoid an import cycle with the transformers
// subpackage. See Tech Decision #20 in the unify-column-type-system spec.
type Type = flyqltype.Type

const (
	TypeString     = flyqltype.String
	TypeInt        = flyqltype.Int
	TypeFloat      = flyqltype.Float
	TypeBool       = flyqltype.Bool
	TypeDate       = flyqltype.Date
	TypeDateTime   = flyqltype.DateTime
	TypeDuration   = flyqltype.Duration
	TypeArray      = flyqltype.Array
	TypeMap        = flyqltype.Map
	TypeStruct     = flyqltype.Struct
	TypeJSON       = flyqltype.JSON
	TypeJSONString = flyqltype.JSONString
	TypeUnknown    = flyqltype.Unknown
	TypeAny        = flyqltype.Any
)
