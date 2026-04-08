all: test
install:
	pip install -e .
	pip install pytest black==26.3.1 mypy
fmt:
	black .
fmt-test:
	black --check .
pytest:
	pytest
type-test:
	mypy flyql/
lint:
	pylint flyql/
test: fmt-test pytest type-test
coverage:
	pytest --cov=flyql --cov-report=html --cov-report=term-missing
cleanup:
	find . -name __pycache__ -type d -exec rm -rf {} +
	rm -rf flyql.egg-info/
	rm -rf build/
	rm -rf htmlcov/
	rm -rf .coverage
