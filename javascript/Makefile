all: test
fmt:
	prettier --config .prettierrc --write src/ test/
fmt-test:
	prettier --config .prettierrc --check src/ test/
vitest:
	npm run test:run
test: fmt-test vitest
