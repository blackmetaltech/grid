import numpy as np, cmath, math
from math import *
def R(id,q,doc,mine,tol=1e-4,note='',absol=False):
    err=abs(mine-doc) if absol else (abs(mine-doc)/abs(doc) if doc!=0 else abs(mine-doc))
    ok=err<=tol
    # rounding check
    print(f"{id} | {q} | {doc} | {mine:.8g} | {err:.2e}{'(abs)' if absol else ''} | {'PASS' if ok else 'FAIL'} | tol {tol} {note}")
d=degrees
