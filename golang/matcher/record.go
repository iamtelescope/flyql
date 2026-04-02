package matcher

import (
	"encoding/json"
	"strconv"
	"strings"
)

type Record struct {
	data map[string]any
}

func NewRecord(data map[string]any) *Record {
	return &Record{data: data}
}

func isProbablyJSONString(value any) bool {
	str, ok := value.(string)
	if !ok {
		return false
	}
	if strings.HasPrefix(str, "{") && strings.HasSuffix(str, "}") {
		return true
	}
	if strings.HasPrefix(str, "[") && strings.HasSuffix(str, "]") {
		return true
	}
	return false
}

func extractPath(value any, path []string) any {
	current := value
	for _, key := range path {
		switch c := current.(type) {
		case []any:
			idx, err := strconv.Atoi(key)
			if err != nil || idx < 0 || idx >= len(c) {
				return nil
			}
			current = c[idx]
		case map[string]any:
			v, exists := c[key]
			if !exists {
				return nil
			}
			current = v
		default:
			return nil
		}
	}
	return current
}

func (r *Record) GetValue(key Key) any {
	value, exists := r.data[key.Value]
	if !exists {
		return nil
	}

	if len(key.Path) == 0 {
		return value
	}

	if isProbablyJSONString(value) {
		var parsed any
		if err := json.Unmarshal([]byte(value.(string)), &parsed); err != nil {
			return nil
		}
		return extractPath(parsed, key.Path)
	}

	m, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	return extractPath(m, key.Path)
}
