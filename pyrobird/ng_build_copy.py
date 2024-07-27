import os
import shutil
import subprocess
import sys


def main():
    # Identify the script's path
    script_path = os.path.dirname(os.path.abspath(__file__))

    # Define the paths
    firebird_ng_path = os.path.join(script_path, '..', 'firebird-ng')
    dist_path = os.path.join(firebird_ng_path, 'dist', 'firebird')
    static_path = os.path.join(script_path, 'src', 'pyrobird', 'server', 'static')
    # Fancy print the paths
    print(f"Script Path:        {script_path}")
    print(f"Firebird NG Path:   {firebird_ng_path}")
    print(f"Dist Path:          {dist_path}")
    print(f"Static Path:        {static_path}")

    # Run `ng build` in script_path/../firebird-ng directory
    try:
        print("Running ng build at firebird-ng")
        subprocess.run(['ng', 'build'], cwd=firebird_ng_path, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running 'ng build': {e}")
        sys.exit(1)

    # Remove all files and folders in script_path/src/pyrobird/server/static
    print("removing existing src/pyrobird/server/static")
    if os.path.exists(static_path):
        shutil.rmtree(static_path)
    os.makedirs(static_path)

    # Copy all files and directories from script_path/../firebird-ng/dist/firebird to script_path/src/pyrobird/server/static
    print("copying firebird-ng/dist/firebird to  src/pyrobird/server/static")
    if os.path.exists(dist_path):
        for item in os.listdir(dist_path):
            s = os.path.join(dist_path, item)
            d = os.path.join(static_path, item)
            if os.path.isdir(s):
                shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)
    else:
        print(f"Source directory {dist_path} does not exist.")
        sys.exit(1)


if __name__ == "__main__":
    main()
