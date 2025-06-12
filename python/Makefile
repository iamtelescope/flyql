all: fmt-test pytest type-test
fmt:
	black .
fmt-test:
	black --check .
pytest:
	pytest
type-test:
	mypy flyql/
test: fmt-test pytest type-test
cleanup:
	find . -name __pycache__ -type d -exec rm -rf {} +
	rm -rf flyql.egg-info/
	rm -rf build/
