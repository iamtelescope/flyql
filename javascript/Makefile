.PHONY: all install fmt fmt-test vitest snippets test coverage

all: test
install:
	pnpm install
fmt:
	npx prettier --config .prettierrc --write src/ test/
fmt-test:
	npx prettier --config .prettierrc --check src/ test/
vitest:
	npm run test:run
snippets:
	npm run snippets
test: fmt-test vitest snippets
coverage:
	npm run test:coverage
