# pyrobird

[![PyPI - Version](https://img.shields.io/pypi/v/pyrobird.svg)](https://pypi.org/project/pyrobird)
[![PyPI - Python Version](https://img.shields.io/pypi/pyversions/pyrobird.svg)](https://pypi.org/project/pyrobird)

-----

**Table of Contents**

- [Installation](#installation)
- [License](#license)

## Installation

```console
pip install pyrobird
```

## License

`pyrobird` is distributed under the terms of the [MIT](https://spdx.org/licenses/MIT.html) license.

## Contributing

- [PEP8](https://peps.python.org/pep-0008/) is required
- [Use Numpy style dockstring comments](https://numpydoc.readthedocs.io/en/latest/format.html)
- [pytest](https://docs.pytest.org/en/latest/) is used for unit tests. Aim for comprehensive coverage of the new code.
- Utilize [type hints](https://docs.python.org/3/library/typing.html) wherever is possible to enhance readability and reduce errors.
- Use of specific exceptions for error handling is better. As described in the [Python documentation](https://docs.python.org/3/tutorial/errors.html) rather than general exceptions.
- Contributions are subject to code review. Please submit pull requests (PRs) against the `main` branch for any contributions.
- Manage dependencies appropriately. Add new dependencies to `pyproject.toml`. Provide a justification for new dependencies