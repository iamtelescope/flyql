fmt:
	npx prettier --config .prettierrc --write src/ *.js *.html

fmt-test:
	npx prettier --config .prettierrc --check src/ *.js *.html

dev:
	E2E_REPORT_FILE=../e2e/output/report.json npx vite

build:
	npx vite build

.PHONY: fmt fmt-test dev build
