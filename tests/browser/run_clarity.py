"""Run the focused actual-UI checks. Not an extra independent suite."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("run_judge.py")),run_name="__main__")
