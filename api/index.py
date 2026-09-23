import os
import sys

# Ensure parent directory is in sys.path so server can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import app
