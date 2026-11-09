import cmath, math
from scipy.optimize import fsolve
def solve(Vs,R,X,P,Q):  # SI-free pu on 1 MVA, 11 kV
    Zb=11**2/1; z=complex(R,X)/Zb
    def F(u):
        V=u[0]*cmath.exp(1j*u[1]); I=(Vs-V)/z; S=V*I.conjugate()-complex(P,Q); return [S.real,S.imag]
    u=fsolve(F,[1,0]); V=u[0]; I=abs(complex(P,Q))/V/(math.sqrt(3)*11)*1000; return V,I
for cond,r,x,amp in [('Weasel',1.1255,0.377,115),('Rabbit',0.6728,0.360,156)]:
  for L in (3,4,5):
    for mill in (1.5,1.2):
        Pm=mill; Qm=mill*math.tan(math.acos(0.70)); Pv=0.5; Qv=0.5*math.tan(math.acos(0.95))
        for lab,qc in (('nocap',0),('cap0.95',Pm*(math.tan(math.acos(0.7))-math.tan(math.acos(0.95))))):
            V,I=solve(1.03,r*L,x*L,Pm+Pv,Qm+Qv-qc)
            print(f"{cond} {L}km mill{mill} {lab:8s} V={V:.4f} I={I:.0f}A load={I/amp:.2f}")
