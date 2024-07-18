import logging
import click
import pyrobird.server

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@click.command()
@click.option("--unsecure-files", "unsecure_files", is_flag=True, show_default=True, default=False, help="Allow unrestricted files download in a system")
@click.pass_context
def serve(ctx, unsecure_files):
    """
    Operations with database (create tables, erase everything, etc)
    """
    pyrobird.server.run(debug=True, config={"ALLOW_UNRESTRICTED_DOWNLOAD": unsecure_files})


if __name__ == '__main__':
    pyrobird.server.run(debug=True)