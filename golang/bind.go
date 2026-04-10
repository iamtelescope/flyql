package flyql

import (
	"fmt"
	"math/big"
	"strconv"

	"github.com/iamtelescope/flyql/golang/types"
)

var durationUnits = map[string]bool{
	"s": true,
	"m": true,
	"h": true,
	"d": true,
	"w": true,
}

// valueTypeFor maps a Go value to its FlyQL ValueType. Returns an error on
// unsupported types.
func valueTypeFor(value any) (types.ValueType, error) {
	if value == nil {
		return types.Null, nil
	}
	switch v := value.(type) {
	case bool:
		return types.Boolean, nil
	case int:
		return types.Integer, nil
	case int8, int16, int32, int64:
		return types.Integer, nil
	case uint, uint8, uint16, uint32:
		return types.Integer, nil
	case uint64:
		if v > uint64(^uint64(0)>>1) { // > math.MaxInt64
			return types.BigInt, nil
		}
		return types.Integer, nil
	case *big.Int:
		if v.IsInt64() {
			return types.Integer, nil
		}
		return types.BigInt, nil
	case float32, float64:
		return types.Float, nil
	case string:
		return types.String, nil
	}
	return "", fmt.Errorf("unsupported parameter value type: %T", value)
}

// parseDuration parses a string like "5m" or "1h" into a Duration.
func parseDuration(value string) (Duration, error) {
	if len(value) < 2 {
		return Duration{}, fmt.Errorf("invalid duration value: %q", value)
	}
	unit := value[len(value)-1:]
	if !durationUnits[unit] {
		return Duration{}, fmt.Errorf("invalid duration unit '%s' - expected one of s, m, h, d, w", unit)
	}
	num, err := strconv.ParseInt(value[:len(value)-1], 10, 64)
	if err != nil {
		return Duration{}, fmt.Errorf("invalid duration value: %q", value)
	}
	return Duration{Value: num, Unit: unit}, nil
}

type bindState struct {
	params        map[string]any
	consumed      map[string]bool
	maxPositional int
}

func (s *bindState) resolveParam(p *Parameter) (any, error) {
	if p.Positional {
		if idx, err := strconv.Atoi(p.Name); err == nil {
			if idx > s.maxPositional {
				s.maxPositional = idx
			}
		}
	}
	v, ok := s.params[p.Name]
	if !ok {
		return nil, fmt.Errorf("unbound parameter: $%s", p.Name)
	}
	s.consumed[p.Name] = true
	return v, nil
}

func (s *bindState) bindFunctionCall(fc *FunctionCall) error {
	if len(fc.ParameterArgs) == 0 {
		return nil
	}

	switch fc.Name {
	case "ago":
		for _, p := range fc.ParameterArgs {
			v, err := s.resolveParam(p)
			if err != nil {
				return err
			}
			switch val := v.(type) {
			case string:
				d, err := parseDuration(val)
				if err != nil {
					return err
				}
				fc.DurationArgs = append(fc.DurationArgs, d)
			case Duration:
				fc.DurationArgs = append(fc.DurationArgs, val)
			default:
				return fmt.Errorf("ago() parameter must be a duration string or Duration, got %T", v)
			}
		}
	case "today":
		if len(fc.ParameterArgs) > 1 {
			return fmt.Errorf("today() accepts at most one parameter (timezone)")
		}
		v, err := s.resolveParam(fc.ParameterArgs[0])
		if err != nil {
			return err
		}
		tz, ok := v.(string)
		if !ok {
			return fmt.Errorf("today() timezone parameter must be a string, got %T", v)
		}
		fc.Timezone = tz
	case "startOf":
		idx := 0
		if fc.Unit == "" {
			v, err := s.resolveParam(fc.ParameterArgs[idx])
			if err != nil {
				return err
			}
			unit, ok := v.(string)
			if !ok {
				return fmt.Errorf("startOf() unit parameter must be a string, got %T", v)
			}
			if unit != "day" && unit != "week" && unit != "month" {
				return fmt.Errorf("invalid unit '%s' - expected 'day', 'week', or 'month'", unit)
			}
			fc.Unit = unit
			idx++
		}
		if idx < len(fc.ParameterArgs) {
			v, err := s.resolveParam(fc.ParameterArgs[idx])
			if err != nil {
				return err
			}
			tz, ok := v.(string)
			if !ok {
				return fmt.Errorf("startOf() timezone parameter must be a string, got %T", v)
			}
			fc.Timezone = tz
			idx++
		}
		if idx < len(fc.ParameterArgs) {
			return fmt.Errorf("startOf() accepts at most two parameters (unit, timezone)")
		}
	case "now":
		return fmt.Errorf("now() does not accept arguments")
	default:
		return fmt.Errorf("unknown function: %s", fc.Name)
	}

	fc.ParameterArgs = nil
	return nil
}

func (s *bindState) bindExpression(expr *Expression) error {
	switch v := expr.Value.(type) {
	case *Parameter:
		val, err := s.resolveParam(v)
		if err != nil {
			return err
		}
		vt, err := valueTypeFor(val)
		if err != nil {
			return err
		}
		expr.Value = val
		expr.ValueType = vt
		return nil
	case *FunctionCall:
		return s.bindFunctionCall(v)
	}

	if expr.Values != nil {
		newValues := make([]any, len(expr.Values))
		newTypes := make([]types.ValueType, len(expr.Values))
		for i, item := range expr.Values {
			if p, ok := item.(*Parameter); ok {
				val, err := s.resolveParam(p)
				if err != nil {
					return err
				}
				vt, err := valueTypeFor(val)
				if err != nil {
					return err
				}
				newValues[i] = val
				newTypes[i] = vt
			} else {
				newValues[i] = item
				if i < len(expr.ValuesTypes) {
					newTypes[i] = expr.ValuesTypes[i]
				} else {
					vt, err := valueTypeFor(item)
					if err != nil {
						return err
					}
					newTypes[i] = vt
				}
			}
		}
		expr.Values = newValues
		expr.ValuesTypes = newTypes
	}

	return nil
}

func (s *bindState) walk(node *Node) error {
	if node == nil {
		return nil
	}
	if node.Expression != nil {
		if err := s.bindExpression(node.Expression); err != nil {
			return err
		}
	}
	if err := s.walk(node.Left); err != nil {
		return err
	}
	return s.walk(node.Right)
}

// BindParams walks a parsed AST and substitutes parameter placeholders with
// concrete values from params. It mutates the tree in place.
//
// params is a map from parameter names (without the '$' prefix) to concrete
// values. Positional parameters use string keys of digits (e.g. "1").
//
// Returns an error if a referenced parameter is missing, if an extra param is
// supplied, or if a value has an unsupported type.
func BindParams(node *Node, params map[string]any) error {
	if params == nil {
		params = map[string]any{}
	}
	state := &bindState{
		params:   params,
		consumed: make(map[string]bool),
	}
	if err := state.walk(node); err != nil {
		return err
	}

	// Any provided param not consumed is "unused".
	for key := range params {
		if state.consumed[key] {
			continue
		}
		return fmt.Errorf("unused parameter: %s", key)
	}

	// Every positional index from 1 to max must be provided.
	for i := 1; i <= state.maxPositional; i++ {
		if _, ok := params[strconv.Itoa(i)]; !ok {
			return fmt.Errorf("unbound parameter: $%d", i)
		}
	}

	return nil
}
