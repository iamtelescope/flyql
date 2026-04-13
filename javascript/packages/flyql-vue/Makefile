.PHONY: all test fmt fmt-test vitest coverage

all: test
fmt:
	npx prettier --config ../../.prettierrc --write src/ test/
fmt-test:
	npx prettier --config ../../.prettierrc --check src/ test/
vitest:
	npx vitest run
test: fmt-test vitest
coverage:
	npx vitest run --coverage
