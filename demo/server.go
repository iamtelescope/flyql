package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
	"github.com/iamtelescope/flyql/golang/generators/postgresql"
	"github.com/iamtelescope/flyql/golang/generators/starrocks"

	"github.com/gin-gonic/gin"
)

//go:embed dist/*
var frontend embed.FS

// demoColumn is the single source of truth for all column definitions.
// Generator-specific columns, autocomplete data, and the frontend editor
// config are all derived from this.
type demoColumn struct {
	// Editor config
	EditorType   string            `json:"type"`
	Suggest      bool              `json:"suggest"`
	Autocomplete bool              `json:"autocomplete,omitempty"`
	Values       []any             `json:"values,omitempty"`
	Children     map[string]any    `json:"children,omitempty"`

	// Generator types (not sent to frontend)
	CHType     string `json:"-"`
	CHJsonStr  bool   `json:"-"`
	PGType     string `json:"-"`
	SRType     string `json:"-"`
	SRJsonStr  bool   `json:"-"`

	// Autocomplete suggestions fetched via API (not inline values)
	AutocompleteSuggestions []string `json:"-"`
}

var demoColumns = map[string]*demoColumn{
	"level": {
		EditorType: "enum", Suggest: true, Autocomplete: true,
		Values:     toAnySlice("debug", "info", "warning", "error", "critical"),
		CHType:     "String", PGType: "varchar(255)", SRType: "VARCHAR(255)",
	},
	"level_detail": {
		EditorType: "string", Suggest: true,
		CHType:     "String", PGType: "varchar(255)", SRType: "VARCHAR(255)",
	},
	"service": {
		EditorType: "string", Suggest: true, Autocomplete: true,
		CHType:     "String", PGType: "varchar(255)", SRType: "VARCHAR(255)",
		AutocompleteSuggestions: []string{"api-gateway", "api-users", "api-billing", "worker-email", "worker-ingest", "frontend-web", "frontend-mobile"},
	},
	"message": {
		EditorType: "string", Suggest: true,
		CHType:     "String", PGType: "text", SRType: "STRING",
	},
	"status_code": {
		EditorType: "number", Suggest: true, Autocomplete: true,
		Values:     toAnySlice(200, 201, 204, 301, 400, 401, 403, 404, 500, 502, 503),
		CHType:     "UInt16", PGType: "integer", SRType: "INT",
	},
	"host": {
		EditorType: "string", Suggest: true, Autocomplete: true,
		CHType:     "String", PGType: "varchar(255)", SRType: "VARCHAR(255)",
		AutocompleteSuggestions: []string{"prod-us-1", "prod-us-2", "prod-eu-1", "staging-1", "dev-local"},
	},
	"path": {
		EditorType: "string", Suggest: true, Autocomplete: true,
		CHType:     "String", PGType: "varchar(255)", SRType: "VARCHAR(255)",
		AutocompleteSuggestions: []string{"/api/v1/users", "/api/v1/auth", "/api/v1/billing", "/api/v2/search", "/health", "/metrics"},
	},
	"duration_ms": {
		EditorType: "number", Suggest: true,
		CHType:     "UInt32", PGType: "integer", SRType: "INT",
	},
	"method": {
		EditorType: "enum", Suggest: true, Autocomplete: true,
		Values:     toAnySlice("GET", "POST", "PUT", "DELETE", "PATCH"),
		CHType:     "String", PGType: "varchar(10)", SRType: "VARCHAR(10)",
	},
	"role": {
		EditorType: "enum", Suggest: true, Autocomplete: true,
		Values:     toAnySlice("admin", "editor", "viewer", "guest"),
		CHType:     "String", PGType: "varchar(50)", SRType: "VARCHAR(50)",
	},
	"metadata": {
		EditorType: "object", Suggest: true,
		Children: map[string]any{
			"labels": map[string]any{
				"type": "object", "suggest": true,
				"children": map[string]any{
					"tier": map[string]any{"type": "string", "suggest": true, "autocomplete": true, "values": []string{"dev", "staging", "prod"}},
					"env":  map[string]any{"type": "string", "suggest": true, "autocomplete": true},
				},
			},
			"version": map[string]any{"type": "string", "suggest": true},
		},
		CHType: "JSON", PGType: "jsonb", SRType: "JSON",
	},
	"request": {
		EditorType: "object", Suggest: true,
		CHType:     "JSON", PGType: "jsonb", SRType: "JSON",
	},
	"user@host": {
		EditorType: "string", Suggest: true, Autocomplete: true,
		CHType:     "String", PGType: "text", SRType: "STRING",
		AutocompleteSuggestions: []string{"alice@web1", "bob@web2", "charlie@web1", "alice@web3", "bob@web1", "dave@web2"},
	},
}

func toAnySlice(items ...any) []any {
	return items
}

func buildGeneratorColumns() (map[string]*clickhouse.Column, map[string]*postgresql.Column, map[string]*starrocks.Column) {
	ch := make(map[string]*clickhouse.Column)
	pg := make(map[string]*postgresql.Column)
	sr := make(map[string]*starrocks.Column)

	for name, col := range demoColumns {
		var enumValues []string
		if col.EditorType == "enum" {
			for _, v := range col.Values {
				if s, ok := v.(string); ok {
					enumValues = append(enumValues, s)
				}
			}
		}
		ch[name] = clickhouse.NewColumn(name, col.CHJsonStr, col.CHType, enumValues)
		pg[name] = postgresql.NewColumn(name, col.PGType, enumValues)
		sr[name] = starrocks.NewColumn(name, col.SRJsonStr, col.SRType, enumValues)
	}
	return ch, pg, sr
}

func buildAutocompleteData() map[string][]string {
	data := make(map[string][]string)
	for name, col := range demoColumns {
		if len(col.AutocompleteSuggestions) > 0 {
			data[name] = col.AutocompleteSuggestions
		}
	}
	return data
}

var chColumns, pgColumns, srColumns = buildGeneratorColumns()
var autocompleteData = buildAutocompleteData()

type discoveredKey struct {
	Name        string `json:"name"`
	Type        string `json:"type,omitempty"`
	HasChildren bool   `json:"hasChildren,omitempty"`
}

var keyDiscoveryData = map[string][]discoveredKey{
	"request": {
		{Name: "method", Type: "string"},
		{Name: "url", Type: "string"},
		{Name: "headers", Type: "object", HasChildren: true},
	},
	"request|headers": {
		{Name: "content_type", Type: "string"},
		{Name: "accept", Type: "string"},
		{Name: "authorization", Type: "string"},
	},
}

func main() {
	r := gin.Default()

	r.GET("/api/columns", func(c *gin.Context) {
		c.JSON(http.StatusOK, demoColumns)
	})

	r.GET("/api/autocomplete", func(c *gin.Context) {
		key := c.Query("key")
		log.Printf("autocomplete: key=%s value=%s", key, c.Query("value"))

		time.Sleep(1 * time.Second)

		items, ok := autocompleteData[key]
		if !ok {
			items = []string{}
		}

		c.JSON(http.StatusOK, gin.H{"items": items})
	})

	r.GET("/api/discover-keys", func(c *gin.Context) {
		segmentsParam := c.Query("segments")
		log.Printf("discover-keys: column=%s segments=%s", c.Query("column"), segmentsParam)

		time.Sleep(500 * time.Millisecond)

		segments := strings.Split(segmentsParam, ",")
		lookupKey := strings.Join(segments, "|")
		keys, ok := keyDiscoveryData[lookupKey]
		if !ok {
			keys = []discoveredKey{}
		}

		c.JSON(http.StatusOK, gin.H{"keys": keys})
	})

	r.POST("/api/generate", func(c *gin.Context) {
		var req struct {
			Query   string `json:"query"`
			Dialect string `json:"dialect"`
		}
		if err := c.BindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		result, err := flyql.Parse(req.Query)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var sql string
		switch req.Dialect {
		case "clickhouse":
			sql, err = clickhouse.ToSQL(result.Root, chColumns)
		case "postgresql":
			sql, err = postgresql.ToSQLWhere(result.Root, pgColumns)
		case "starrocks":
			sql, err = starrocks.ToSQLWhere(result.Root, srColumns)
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown dialect: " + req.Dialect})
			return
		}

		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"sql": "WHERE " + sql})
	})

	dist, err := fs.Sub(frontend, "dist")
	if err != nil {
		log.Fatal(err)
	}
	r.NoRoute(gin.WrapH(http.FileServer(http.FS(dist))))

	log.Println("serving on http://localhost:8080")
	if err := r.Run("127.0.0.1:8080"); err != nil {
		log.Fatal(err)
	}
}
