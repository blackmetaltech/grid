import numpy as np, cmath, math
from scipy.optimize import fsolve
# 2-bus: source 1.0 pu behind Thevenin x_s (ring), then n circuits of line (exact pi), city load P at pf .92 (+shunt Q comp)
Zb=220**2/100
def line(r,x,b,l,n):
    z=complex(r,x); y=complex(0,b); g=cmath.sqrt(z*y); Zc=cmath.sqrt(z/y)
    Zs=Zc*cmath.sinh(g*l)/Zb/n; Ysh=cmath.tanh(g*l/2)/Zc*Zb*n
    return Zs,Ysh
def maxload(n,l,pf=0.92,qcomp=0.0,xs=0.02,statcom=0.0,r=0.0418,x=0.302,b=3.72e-6):
    Zs,Ysh=line(r,x,b,l,n)
    # find max P with continuation: solve V2 given P
    tan=math.tan(math.acos(pf)); best=0; v=None
    for P in np.arange(0.1,15,0.02):
        def F(u):
            V2=u[0]*cmath.exp(1j*u[1]); Vs=1.0
            Zt=Zs+1j*xs
            I=(Vs-V2)/Zt
            S_in=V2*np.conj(I) - V2*np.conj(V2*Ysh) # line delivers load + shunt absorption (shunt generates Q: Ysh=jB)
            Sload=complex(P,P*tan) - 1j*qcomp*abs(V2)**2
            return [ (S_in-Sload).real, (S_in-Sload).imag ]
        u,info,ier,msg=fsolve(F,[1.0 if v is None else v[0], -0.2 if v is None else v[1]],full_output=True)
        if ier!=1 or u[0]<0.3: break
        best=P; v=u
    return best*100
for n in (2,1):
    for qc in (0,0.8):
        print("twinZebra220 150km n=%d qcomp=%.1fpu Pmax=%.0f MW"%(n,qc,maxload(n,150,qcomp=qc)))
# STATCOM as constant-current Q = Imax*|V| (pu), Imax=1.0 (100 MVAr) ; reuse by monkeypatching qcomp*V^2 -> Imax*V
def maxload_statcom(n,l,Imax,pf=0.92,xs=0.02,r=0.0418,x=0.302,b=3.72e-6):
    Zs,Ysh=line(r,x,b,l,n); tan=math.tan(math.acos(pf)); best=0; v=None
    for P in np.arange(0.1,15,0.02):
        def F(u):
            V2=u[0]*cmath.exp(1j*u[1]); I=(1.0-V2)/(Zs+1j*xs)
            S_in=V2*np.conj(I)-V2*np.conj(V2*Ysh)
            Sload=complex(P,P*tan)-1j*Imax*abs(V2)
            return [(S_in-Sload).real,(S_in-Sload).imag]
        u,info,ier,msg=fsolve(F,[1.0 if v is None else v[0],-0.2 if v is None else v[1]],full_output=True)
        if ier!=1 or u[0]<0.3: break
        best=P; v=u
    return best*100
print("n=1 STATCOM 100 MVAr Pmax=%.0f MW; 200 MVAr Pmax=%.0f MW"%(maxload_statcom(1,150,1.0),maxload_statcom(1,150,2.0)))
