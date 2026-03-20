package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"time"

	flyql "github.com/iamtelescope/flyql/golang"
	"github.com/iamtelescope/flyql/golang/generators/clickhouse"
	"github.com/iamtelescope/flyql/golang/generators/postgresql"
	"github.com/iamtelescope/flyql/golang/generators/starrocks"

	"github.com/gin-gonic/gin"
)

//go:embed dist/*
var frontend embed.FS

var autocompleteData = map[string][]string{
	"service":     {"api-gateway", "api-users", "api-billing", "worker-email", "worker-ingest", "frontend-web", "frontend-mobile"},
	"host":        {"prod-us-1", "prod-us-2", "prod-eu-1", "staging-1", "dev-local"},
	"path":        {"/api/v1/users", "/api/v1/auth", "/api/v1/billing", "/api/v2/search", "/health", "/metrics"},
	"status_code": {"200", "201", "204", "301", "400", "401", "403", "404", "500", "502", "503"},
}

var pgColumns = map[string]*postgresql.Column{
	"level":       postgresql.NewColumn("level", "varchar(255)", []string{"debug", "info", "warning", "error", "critical"}),
	"service":     postgresql.NewColumn("service", "varchar(255)", nil),
	"message":     postgresql.NewColumn("message", "text", nil),
	"status_code": postgresql.NewColumn("status_code", "integer", nil),
	"host":        postgresql.NewColumn("host", "varchar(255)", nil),
	"path":        postgresql.NewColumn("path", "varchar(255)", nil),
	"duration_ms": postgresql.NewColumn("duration_ms", "integer", nil),
	"method":      postgresql.NewColumn("method", "varchar(10)", []string{"GET", "POST", "PUT", "DELETE", "PATCH"}),
	"role":        postgresql.NewColumn("role", "varchar(50)", []string{"admin", "editor", "viewer", "guest"}),
}

var chColumns = map[string]*clickhouse.Column{
	"level":       clickhouse.NewColumn("level", false, "String", []string{"debug", "info", "warning", "error", "critical"}),
	"service":     clickhouse.NewColumn("service", false, "String", nil),
	"message":     clickhouse.NewColumn("message", false, "String", nil),
	"status_code": clickhouse.NewColumn("status_code", false, "UInt16", nil),
	"host":        clickhouse.NewColumn("host", false, "String", nil),
	"path":        clickhouse.NewColumn("path", false, "String", nil),
	"duration_ms": clickhouse.NewColumn("duration_ms", false, "UInt32", nil),
	"method":      clickhouse.NewColumn("method", false, "String", []string{"GET", "POST", "PUT", "DELETE", "PATCH"}),
	"role":        clickhouse.NewColumn("role", false, "String", []string{"admin", "editor", "viewer", "guest"}),
}

var srColumns = map[string]*starrocks.Column{
	"level":       starrocks.NewColumn("level", false, "VARCHAR(255)", []string{"debug", "info", "warning", "error", "critical"}),
	"service":     starrocks.NewColumn("service", false, "VARCHAR(255)", nil),
	"message":     starrocks.NewColumn("message", false, "STRING", nil),
	"status_code": starrocks.NewColumn("status_code", false, "INT", nil),
	"host":        starrocks.NewColumn("host", false, "VARCHAR(255)", nil),
	"path":        starrocks.NewColumn("path", false, "VARCHAR(255)", nil),
	"duration_ms": starrocks.NewColumn("duration_ms", false, "INT", nil),
	"method":      starrocks.NewColumn("method", false, "VARCHAR(10)", []string{"GET", "POST", "PUT", "DELETE", "PATCH"}),
	"role":        starrocks.NewColumn("role", false, "VARCHAR(50)", []string{"admin", "editor", "viewer", "guest"}),
}

func main() {
	r := gin.Default()

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
