.PHONY: all install fmt fmt-test vet lint gotest staticcheck snippets test coverage cleanup

all: test
install:
	# Pinned: staticcheck v0.8.x requires Go >= 1.26, CI builds on 1.25.
	go install honnef.co/go/tools/cmd/staticcheck@v0.7.0
fmt:
	go fmt ./...
	cd e2e && go fmt ./...
fmt-test:
	@test -z "$$(gofmt -l .)" || (echo "Files not formatted:" && gofmt -l . && exit 1)
vet:
	go vet ./...
lint:
	golangci-lint run ./...
gotest:
	go test -v ./...
staticcheck:
	staticcheck ./...
snippets:
	@./scripts/verify-snippet-layout.sh
	go build ./snippets/...
test: fmt-test vet staticcheck gotest snippets
coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	go tool cover -func=coverage.out
cleanup:
	go clean -testcache
