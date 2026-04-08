all: test
install:
	pnpm install
fmt:
	prettier --config .prettierrc --write src/ test/
fmt-test:
	prettier --config .prettierrc --check src/ test/
vitest:
	npm run test:run
test: fmt-test vitest
coverage:
	npm run test:coverage
