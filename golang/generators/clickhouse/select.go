package clickhouse

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/transformers"
)

type SelectColumn struct {
	Key     flyql.Key
	Alias   string
	Column  *Column
	SQLExpr string
}

type SelectResult struct {
	Columns []*SelectColumn
	SQL     string
}

type rawSelectColumn struct {
	name  string
	alias string
}

var validAliasPattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_.]*$`)

func parseRawSelectColumns(text string) ([]rawSelectColumn, error) {
	parts := strings.Split(text, ",")
	result := make([]rawSelectColumn, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		lower := strings.ToLower(part)
		idx := strings.Index(lower, " as ")
		var name, alias string
		if idx >= 0 {
			name = strings.TrimSpace(part[:idx])
			alias = strings.TrimSpace(part[idx+4:])
		} else {
			name = part
		}
		if name == "" {
			return nil, fmt.Errorf("empty column name")
		}
		result = append(result, rawSelectColumn{name: name, alias: alias})
	}
	return result, nil
}

func resolveColumn(key flyql.Key, columns map[string]*Column) (*Column, []string, error) {
	segments := key.Segments
	for i := len(segments); i > 0; i-- {
		candidateKey := strings.Join(segments[:i], ".")
		col, ok := columns[candidateKey]
		if ok {
			return col, segments[i:], nil
		}
	}
	return nil, nil, fmt.Errorf("unknown column: %s", key.Raw)
}

func buildSelectExpr(column *Column, path []string) (string, error) {
	if len(path) == 0 {
		return column.Name, nil
	}

	if column.IsJSON {
		for _, part := range path {
			if err := validateJSONPathPart(part); err != nil {
				return "", err
			}
		}
		pathParts := make([]string, len(path))
		for i, part := range path {
			pathParts[i] = fmt.Sprintf("`%s`", part)
		}
		return fmt.Sprintf("%s.%s", column.Name, strings.Join(pathParts, ".")), nil
	}

	if column.JSONString {
		pathParts := make([]string, len(path))
		for i, part := range path {
			escaped, err := EscapeParam(part)
			if err != nil {
				return "", err
			}
			pathParts[i] = escaped
		}
		return fmt.Sprintf("JSONExtractString(%s, %s)", column.Name, strings.Join(pathParts, ", ")), nil
	}

	if column.IsMap {
		mapKey := strings.Join(path, ".")
		escaped, err := EscapeParam(mapKey)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s[%s]", column.Name, escaped), nil
	}

	if column.IsArray {
		indexStr := strings.Join(path, ".")
		index, err := strconv.Atoi(indexStr)
		if err != nil {
			return "", fmt.Errorf("invalid array index, expected number: %s", indexStr)
		}
		return fmt.Sprintf("%s[%d]", column.Name, index), nil
	}

	return "", fmt.Errorf("path access on non-composite column type: %s", column.Name)
}

func ToSQLSelect(text string, columns map[string]*Column) (*SelectResult, error) {
	raws, err := parseRawSelectColumns(text)
	if err != nil {
		return nil, err
	}

	result := &SelectResult{
		Columns: make([]*SelectColumn, 0, len(raws)),
	}
	exprs := make([]string, 0, len(raws))

	for _, raw := range raws {
		key, err := flyql.ParseKey(raw.name)
		if err != nil {
			return nil, fmt.Errorf("invalid column name %q: %w", raw.name, err)
		}

		col, path, err := resolveColumn(key, columns)
		if err != nil {
			return nil, err
		}

		sqlExpr, err := buildSelectExpr(col, path)
		if err != nil {
			return nil, fmt.Errorf("column %q: %w", raw.name, err)
		}

		if len(key.Transformers) > 0 {
			registry := transformers.DefaultRegistry()
			if err := validateTransformerChain(key.Transformers, registry); err != nil {
				return nil, fmt.Errorf("column %q: %w", raw.name, err)
			}
			sqlExpr, err = applyTransformerSQL(sqlExpr, key.Transformers, "clickhouse", registry)
			if err != nil {
				return nil, fmt.Errorf("column %q: %w", raw.name, err)
			}
		}

		alias := raw.alias
		if alias != "" {
			if !validAliasPattern.MatchString(alias) {
				return nil, fmt.Errorf("invalid alias: %s", alias)
			}
			quotedAlias := alias
			if strings.Contains(alias, ".") {
				quotedAlias = fmt.Sprintf("`%s`", alias)
			}
			sqlExpr = fmt.Sprintf("%s AS %s", sqlExpr, quotedAlias)
		} else if len(path) > 0 {
			alias = raw.name
			if !validAliasPattern.MatchString(alias) {
				return nil, fmt.Errorf("invalid alias: %s", alias)
			}
			quotedAlias := alias
			if strings.Contains(alias, ".") {
				quotedAlias = fmt.Sprintf("`%s`", alias)
			}
			sqlExpr = fmt.Sprintf("%s AS %s", sqlExpr, quotedAlias)
		}

		result.Columns = append(result.Columns, &SelectColumn{
			Key:     key,
			Alias:   alias,
			Column:  col,
			SQLExpr: sqlExpr,
		})
		exprs = append(exprs, sqlExpr)
	}

	result.SQL = strings.Join(exprs, ", ")
	return result, nil
}
