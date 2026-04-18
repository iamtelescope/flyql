.PHONY: all install fmt fmt-test pytest type-test lint snippets test coverage cleanup

all: test

PYTHON ?= $(if $(VENV),$(VENV)/bin/python,python)
VBIN := $(if $(VENV),$(VENV)/bin/,)

install:
	pip install -e '.[re2]'
	pip install pytest black==26.3.1 mypy pylint
fmt:
	$(VBIN)black .
fmt-test:
	$(VBIN)black --check .
pytest:
	$(VBIN)pytest
type-test:
	$(VBIN)mypy flyql/
lint:
	$(VBIN)pylint flyql/
	$(VBIN)pylint --rcfile=snippets/.pylintrc snippets/
snippets:
	@command -v $(PYTHON) >/dev/null 2>&1 || { \
		echo "ERROR: $(PYTHON) not found. Set PYTHON=... or VENV=... override." >&2; \
		exit 1; \
	}
	@set -e; for f in $$(find snippets -name '*.py' | sort); do \
		echo "  run $$f"; \
		$(PYTHON) "$$f" > /dev/null || { echo "FAIL: $$f"; exit 1; }; \
	done
test: fmt-test lint pytest type-test snippets
coverage:
	pytest --cov=flyql --cov-report=html --cov-report=term-missing
cleanup:
	find . -name __pycache__ -type d -exec rm -rf {} +
	rm -rf flyql.egg-info/
	rm -rf build/
	rm -rf htmlcov/
	rm -rf .coverage
