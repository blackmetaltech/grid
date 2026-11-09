import sys,os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from run_l19 import *
import numpy as np
for b in (250,):
    print('naive+BESS',b,round(sim(build(12),b)['nadir'],3),sim(build(12),b)['shed'])
for nm,u,b in (('naive',build(12),0),('13c',build(13),0),('13c+B200',build(13),200)):
    r=sim(u,b,ufls=False); tr=np.array(r['trace']); 
    i=int(0.5/0.01)-1
    print(nm,'500ms-window slope Hz/s',round((tr[i,1]-50)/0.5,4),' t=0+ ',round(r['rocof_an'],4))
# 660 MW supercritical trip option, naive vs lesson
def sc_build(nc,L=6900,hp=225):
    rest=L-4*hp-660; n=nc-1
    return [sc660(660)]+[coal(rest/n)]*n+[hyd(hp)]*4
for nc in (11,12,13):
    try:
        r=sim(sc_build(nc),0); print('sc660 trip, coal online (incl tripped) 1sc+',nc-1,'x500: nadir',round(r['nadir'],3),'shed',round(r['shed']), 'rocof',round(r['rocof_an'],3))
    except Exception as e: print(e)
