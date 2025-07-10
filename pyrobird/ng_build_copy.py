import os
import shutil
import subprocess
import sys


def main():
    # Identify the script's path
    script_path = os.path.dirname(os.path.abspath(__file__))

    # Define the paths
    firebird_ng_path = os.path.abspath(os.path.join(script_path, '..', 'firebird-ng'))
    dist_path = os.path.join(firebird_ng_path, 'dist', 'firebird', 'browser')
    static_path = os.path.join(script_path, 'pyrobird', 'server', 'static')
    # Fancy print the paths
    print(f"Script Path:        {script_path}")
    print(f"Firebird NG Path:   {firebird_ng_path}")
    print(f"Dist Path:          {dist_path}")
    print(f"Static Path:        {static_path}")

    # Angular can start asking

    # Run `ng build` in script_path/../firebird-ng directory
    try:
        print("Running build at firebird-ng")
        proc = subprocess.Popen(
            ["npm", "run", "build"],
            cwd=firebird_ng_path,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

        for line in proc.stdout:
            print("[ng] " + line, end="")

        proc.wait()
        if proc.returncode:
            sys.exit(proc.returncode)
    except subprocess.CalledProcessError as e:
        print(f"Error running 'build' phase: {e}")
        sys.exit(1)

    # Remove all files and folders in script_path/pyrobird/server/static
    print("removing existing pyrobird/server/static")
    if os.path.exists(static_path):
        shutil.rmtree(static_path)
    os.makedirs(static_path)

    # Copy all files and directories from script_path/../firebird-ng/dist/firebird to script_path/pyrobird/server/static
    print("copying firebird-ng/dist/firebird/browser to  pyrobird/server/static")
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
