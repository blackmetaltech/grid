import numpy as np, cmath
from math import *
from scipy.optimize import fsolve
g=lambda x:float(f"{x:.5g}")
def P(*a): print(*a)
# C1
w=2*pi*50;R=3;X=w*25.48e-3-1/(w*796e-6);Z=complex(R,X)
I=230/abs(Z);P("C1 |Z|",abs(Z),"X",X,"phi",degrees(atan2(X,R)),"I",I,"pf",R/abs(Z),"P",I*I*R)
# C2
w0=1/sqrt(2*32e-6);P("C2 w0",w0,"Q",w0*2/10,"I",22,"VL",22*w0*2)
# C3
X=w*80e-3-1/(w*60e-6);I=230/abs(X);P("C3 X",X,"I",I,"Im",I*sqrt(2))
# C4
A=pi*0.08**2;Em=20*0.03*A*50;P("C4 Em",Em,"Im",Em/10,"P",Em**2/2/10)
# C5
P_=500;Q=P_*(tan(acos(.7))-tan(acos(.95)));w=2*pi*50
P("C5 Q",Q,"Cstar uF",Q*1e3/(w*440**2)*1e6,"Cdelta uF",Q*1e3/(3*w*440**2)*1e6)
# C6
Z=10+40j;VR=132e3/sqrt(3);I=50e6/(sqrt(3)*132e3*.8)*(.8-.6j);VS=VR+Z*I
loss=3*abs(I)**2*10
P("C6 VSLL kV",abs(VS)*sqrt(3)/1e3,"delta",degrees(cmath.phase(VS)),"reg%",(abs(VS)-VR)/VR*100,"loss MW",loss/1e6,"eff",50e6/(50e6+loss),"I",abs(I))
# C7
z=0.1+0.5j;y=3.3e-6j;l=300;gam=cmath.sqrt(z*y);Zc=cmath.sqrt(z/y);A=cmath.cosh(gam*l)
P("C7 A",A,abs(A),degrees(cmath.phase(A)),"VR0 LL kV",220/abs(A),"B",Zc*cmath.sinh(gam*l),"gam",gam)
# C8
Y={}
zs={(0,1):0.02+0.04j,(0,2):0.01+0.03j,(1,2):0.0125+0.025j}
Yb=np.zeros((3,3),complex)
for (i,j),zz in zs.items():
    yy=1/zz;Yb[i,i]+=yy;Yb[j,j]+=yy;Yb[i,j]-=yy;Yb[j,i]-=yy
Ps=np.array([0,-2.566,2.0]);Qs2=-1.102
def inj(V):
    S=V*np.conj(Yb@V);return S
def mis(x):
    V=np.array([1.05,x[0]*cmath.exp(1j*x[1]),1.05*cmath.exp(1j*x[2])])
    S=inj(V);return [S[1].real-Ps[1],S[2].real-Ps[2],S[1].imag-Qs2]
x=np.array([1,0,0.0])
for it in range(30):
    f=np.array(mis(x));J=np.zeros((3,3))
    for k in range(3):
        d=np.zeros(3);d[k]=1e-7;J[:,k]=(np.array(mis(x+d))-f)/1e-7
    x=x-np.linalg.solve(J,f)
V=np.array([1.05,x[0]*cmath.exp(1j*x[1]),1.05*cmath.exp(1j*x[2])]);S=inj(V)
P("C8 |V2|",x[0],"d2",degrees(x[1]),"d3",degrees(x[2]),"S1 MW,Mvar",S[0]*100,"Q3 Mvar",S[2].imag*100,"loss",sum(S).real*100,"resid",max(abs(np.array(mis(x)))))
V1=1.05;V2=1+0j;V3=1.05+0j
V2n=((Ps[1]-1j*Qs2)/np.conj(V2)-Yb[1,0]*V1-Yb[1,2]*V3)/Yb[1,1]
Q3=-(np.conj(V3)*(Yb[2,0]*V1+Yb[2,1]*V2n+Yb[2,2]*V3)).imag
V3n=((Ps[2]-1j*Q3)/np.conj(V3)-Yb[2,0]*V1-Yb[2,1]*V2n)/Yb[2,2]
P("C8 GS V2(1)",V2n,abs(V2n),degrees(cmath.phase(V2n)),"Q3",Q3,"V3raw",V3n,abs(V3n),"ang",degrees(cmath.phase(V3n)),"V3 rescaled",1.05*V3n/abs(V3n))
# C9
Zb=138**2/100;xl=40/Zb;Ib=100/(sqrt(3)*138)
If=1/(0.25+xl);P("C9 xl",xl,"If pu",If,"kA",If*Ib,"Ib",Ib)
z1=.15+.10+xl;z2=.17+.10+xl;z0=.10+120/Zb
Ia=3/(z1+z2+z0);P("C9 SLG z1,z2,z0",z1,z2,z0,"Ia pu",Ia,"kA",Ia*Ib)
z0b=.05+.10+120/Zb;P("C9 alt (wrong, gen X0 included) Ia",3/(z1+z2+z0b))
# C10
a=np.array([.004,.006,.009]);b=np.array([5.3,5.5,5.8])
def ed(D,lo=None,hi=None):
    act=[0,1,2];fixed={}
    while True:
        lam=(D-sum(fixed.values())+sum(b[i]/(2*a[i]) for i in act))/sum(1/(2*a[i]) for i in act)
        Pn={i:(lam-b[i])/(2*a[i]) for i in act};bad=False
        for i in list(act):
            if lo is not None and Pn[i]<lo[i]-1e-9: fixed[i]=lo[i];act.remove(i);bad=True;break
            if hi is not None and Pn[i]>hi[i]+1e-9: fixed[i]=hi[i];act.remove(i);bad=True;break
        if not bad: Pn.update(fixed);return lam,[Pn[i] for i in range(3)]
P("C10a",ed(975))
l,p=ed(1000,[200,150,100],[450,350,300]);P("C10b",l,p,sum(p))
# C11
def eq(v):
    p1,p2,lam=v
    d1=2e-4*p1-4e-5*p2;d2=-4e-5*p1+3e-4*p2
    PL=1e-4*p1**2-4e-5*p1*p2+1.5e-4*p2**2
    return [8+.008*p1-lam*(1-d1),9+.01*p2-lam*(1-d2),p1+p2-PL-300]
s=fsolve(eq,[200,100,10],xtol=1e-13);p1,p2,lam=s
P("C11",s,"PL",1e-4*p1**2-4e-5*p1*p2+1.5e-4*p2**2)
# C12
d0=asin(.8/1.8);dm=pi-d0;dc=acos((.8*(dm-d0)+1.8*cos(dm))/1.8)
ws=2*pi*60;H=5
tc=sqrt(2*H*(dc-d0)/(ws*.8))
d=d0;om=0;t=0;h=1e-5
acc=lambda:ws/(2*H)*.8
while d<dc:
    # constant accel, RK4 exact anyway
    k1d=om;k1o=acc();k2d=om+h/2*k1o;k2o=acc();k3d=om+h/2*k2o;k4d=om+h*k3o if False else om+h*k2o
    d+=h/6*(k1d+2*k2d+2*(om+h/2*k2o)+k4d);om+=h*k1o;t+=h
P("C12 d0",degrees(d0),"dm",degrees(dm),"dc",degrees(dc),"tc",tc,"rk4 t",t)
# C13
R1=.04*50/500;R2=.05*50/300;df=-100/(1/R1+1/R2);P("C13",df,-df/R1,-df/R2)
# C14
E=1+1j*1.2*(.8-.6j);P("C14 E",abs(E),degrees(cmath.phase(E)),"Pmax",1/1.2)
# C15
def f(x):
    V2=x[0]*cmath.exp(1j*x[1]);I=(1-V2)/(0.05+.15j);S=V2*np.conj(I)
    return [S.real-(-0.8)*-1 if False else (V2*np.conj((V2-1)/(0.05+.15j))).real+0.8*(-1)*-1*0 ,0]
def f(x):
    V2=x[0]*cmath.exp(1j*x[1]);Ir=(V2-1)/(0.05+.15j)  # current from 2 toward 1
    S2=V2*np.conj((1-V2)/(0.05+.15j))  # power received at 2
    return [S2.real-0.8,S2.imag-0.4]
for g0 in ([1,0],[.5,0]):
    s=fsolve(f,g0,xtol=1e-13);V2=s[0]*cmath.exp(1j*s[1]);I=(1-V2)/(.05+.15j)
    P("C15",s[0],degrees(s[1]),"loss",abs(I)**2*.05,abs(I)**2*.15,"I",abs(I),"res",f(s))
