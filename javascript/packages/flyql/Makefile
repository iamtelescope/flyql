.PHONY: all test fmt fmt-test vitest snippets coverage

all: test
fmt:
	npx prettier --config ../../.prettierrc --write src/ test/
fmt-test:
	npx prettier --config ../../.prettierrc --check src/ test/
vitest:
	npx vitest run
snippets:
	node ../../scripts/run-snippets.mjs
test: fmt-test vitest snippets
coverage:
	npx vitest run --coverage
