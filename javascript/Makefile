all: test
install:
	pnpm install
fmt:
	npx prettier --config .prettierrc --write src/ test/
fmt-test:
	npx prettier --config .prettierrc --check src/ test/
vitest:
	npm run test:run
test: fmt-test vitest
coverage:
	npm run test:coverage
