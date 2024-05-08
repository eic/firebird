# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import sys

if __name__ == '__main__':
    from pyrobird.cli import cli_app
    sys.exit(cli_app())
