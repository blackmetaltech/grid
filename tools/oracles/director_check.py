import numpy as np, cmath, math
from scipy.linalg import expm
from scipy.optimize import fsolve, brentq
np.set_printoptions(precision=6, suppress=True)
d = math.degrees

# ---------- PS-15/16 3-bus NR (own implementation, analytic-free numerical Jacobian) ----------
z = {(0,1):0.02+0.04j,(0,2):0.01+0.03j,(1,2):0.0125+0.025j}
Y = np.zeros((3,3),complex)
for (i,k),zz in z.items():
    y=1/zz; Y[i,i]+=y; Y[k,k]+=y; Y[i,k]-=y; Y[k,i]-=y
def mism(x):
    th2,th3,v2=x
    V=np.array([1.05, v2*np.exp(1j*th2), 1.05*np.exp(1j*th3)])
    S=V*np.conj(Y@V)
    return np.array([S[1].real+2.566, S[2].real-2.0, S[1].imag+1.102]), V, S
x=np.array([0,0,1.0])
for it in range(10):
    f,V,S=mism(x)
    if np.max(abs(f))<1e-12: break
    J=np.zeros((3,3)); h=1e-7
    for j in range(3):
        xp=x.copy(); xp[j]+=h; J[:,j]=(mism(xp)[0]-f)/h
    x=x-np.linalg.solve(J,f)
f,V,S=mism(x)
loss=S.sum().real*100
print("NR3: |V2|=%.5f d2=%.4f d3=%.4f slackP=%.3f slackQ=%.3f Q3=%.3f loss=%.3f it=%d"%(abs(V[1]),d(np.angle(V[1])),d(np.angle(V[2])),S[0].real*100,S[0].imag*100,S[2].imag*100,loss,it))
# KCL / Tellegen style: sum of branch losses equals sum of injections
bl=0
for (i,k),zz in z.items():
    I=(V[i]-V[k])/zz; bl+=abs(I)**2*zz.real
print("branch I2R sum MW=%.4f"%(bl*100))

# ---------- PS-13 2-bus ----------
R,X,P,Q=0.05,0.15,0.8,0.4
a=1; b=2*(R*P+X*Q)-1; c=(R*R+X*X)*(P*P+Q*Q)
xs=(-b+math.sqrt(b*b-4*a*c))/2
print("2bus |V2|=%.5f"%math.sqrt(xs))

# ---------- PS-24 CCT ----------
Pm,Pmax,H,f0=0.8,1.8,5,60
d0=math.asin(Pm/Pmax); dmax=math.pi-d0
dcr=math.acos((Pm*(dmax-d0)+Pmax*math.cos(dmax))/Pmax)
tcr=math.sqrt(4*H*(dcr-d0)/(2*math.pi*f0*Pm))
print("CCT d0=%.3f dcr=%.3f tcr=%.5f"%(d(d0),d(dcr),tcr))

# ---------- PS-22 ED with losses ----------
def eqs(v):
    P1,P2,lam=v
    PL=1e-4*P1**2+2*(-2e-5)*P1*P2+1.5e-4*P2**2
    dL1=2e-4*P1-4e-5*P2; dL2=3e-4*P2-4e-5*P1
    return [(8+0.008*P1)-lam*(1-dL1),(9+0.01*P2)-lam*(1-dL2),P1+P2-300-PL]
s=fsolve(eqs,[200,100,10]); print("ED-loss P1=%.3f P2=%.3f lam=%.4f"%tuple(s))

# ---------- PS-08 long line ----------
zl=0.1+0.5j; yl=3.3e-6j; l=300
g=cmath.sqrt(zl*yl); Zc=cmath.sqrt(zl/yl); A=cmath.cosh(g*l)
print("long A=",A," VR0 kV=%.3f"%(220/abs(A)))

# ---------- game-specific oracles ----------
rho=1.724e-8
Rc=2*300*rho/2.5e-6; RL=48**2/480; I=48/(Rc+RL)
print("G01 DC: Rcable=%.4f I=%.4f Vload=%.4f Pload=%.2f Ploss=%.2f"%(Rc,I,I*RL,I*I*RL,I*I*Rc))
# harmonic resonance
V=11e3; Ssc=50e6; Qc=2e6
Xs=V*V/Ssc; Xc=V*V/Qc; print("G03 hr=%.4f fr=%.2f"%(math.sqrt(Xc/Xs),50*math.sqrt(Xc/Xs)))
Xr=0.07*Xc; print("G04 detuned series h=%.4f parallel h=%.4f Qeff MVAr=%.4f"%(1/math.sqrt(0.07),math.sqrt(Xc/(Xs+Xr)),V*V/(Xc-Xr)/1e6))
# harmonic voltage at bus with 5th current injection 20 A into undetuned bank (parallel resonance) with R damping
# neutral current
a120=cmath.exp(2j*math.pi/3)
IN=10+6*a120**-1+4*a120
print("G05 IN=%.4f A ang=%.2f"%(abs(IN),d(cmath.phase(IN))))
# IDMT
tS=lambda TMS,M,k=0.14,al=0.02: TMS*k/(M**al-1)
t1=tS(0.1,4000/400); print("G06 t=%.4f s"%t1)
tms2=(t1+0.3)*((4000/600)**0.02-1)/0.14; print("G07 TMS2=%.4f"%tms2)
print("G07b VI t=%.4f EI t=%.4f"%(tS(0.1,10,13.5,1),tS(0.1,10,80,2)))
# wind curve
print("G08 wind 8 m/s MW=%.4f"%(3*(8**3-3**3)/(12**3-3**3)))
# BESS
eta=math.sqrt(0.86); print("G09 SoC drop=%.3f MWh"%(50/eta))
# nose
print("G10 Pmax nose=%.4f Vnose=%.4f"%(1/(2*0.15),1/math.sqrt(2)))
# Ferranti lossless
beta=2*math.pi*50*math.sqrt(1e-3*11e-9); print("G11 beta=%.5e rise=%.3f%%"%(beta,(1/math.cos(beta*300)-1)*100))
# frequency: 2H dw/dt = dPm - dPL - D w ; Tg dPm/dt = -w/R - dPm  (pu)
H,D,R_,Tg,dPL=5.0,1.0,0.05,0.5,0.1
A_=np.array([[-D/(2*H),1/(2*H)],[-1/(R_*Tg),-1/Tg]]); B_=np.array([-dPL/(2*H),0])
def xa(t):
    # x' = A x + B (constant) -> x = A^-1 (e^{At}-I) B
    return np.linalg.solve(A_,(expm(A_*t)-np.eye(2))@B_)
def rk4(T,dt=0.01):
    x=np.zeros(2); f=lambda x:A_@x+B_
    for _ in range(int(round(T/dt))):
        k1=f(x);k2=f(x+dt/2*k1);k3=f(x+dt/2*k2);k4=f(x+dt*k3); x=x+dt/6*(k1+2*k2+2*k3+k4)
    return x
for T in (1,2,5,30):
    print("G12 t=%d analytic df=%.6f Hz rk4=%.6f Hz"%(T,xa(T)[0]*50,rk4(T)[0]*50))
ts=np.linspace(0,20,20001); w=[xa(t)[0] for t in ts]; i=int(np.argmin(w))
print("G12 nadir=%.5f Hz at t=%.3f s; ss=%.5f Hz (=-dPL/(1/R+D)*50=%.5f); RoCoF0=%.4f Hz/s"%(w[i]*50,ts[i],xa(200)[0]*50,-dPL/(1/R_+D)*50,-dPL/(2*H)*50))
# hydro: (1 - Tw s)/(1+0.5 Tw s) step -> 1-3exp(-2t/Tw)
Tw=2.0; print("G13 hydro y(0+)=-2 y(1s)=%.5f"%(1-3*math.exp(-2*1/Tw)))
# PV
print("G14 PV=%.2f MW"%(100*0.8*(1-0.004*20)))
# THD
print("G15 THD=%.4f"%math.sqrt(0.04**2+0.03**2))
# heat rate
print("G16 marginal cost Rs/MWh=%.1f"%(10.3*220))
# transformer tap 2-bus: MATPOWER model, tap a at from side (bus1), x=0.1, load 0.5+j0.2 at bus2, V1=1
a_t=1.05; yt=1/(0.1j)
Yt=np.array([[yt/a_t**2,-yt/a_t],[-yt/a_t,yt]])
def m2(v):
    th,vm=v; Vv=np.array([1.0,vm*np.exp(1j*th)]); S=Vv*np.conj(Yt@Vv); return [S[1].real+0.5,S[1].imag+0.2]
s=fsolve(m2,[0,1]); print("G17 tap a=1.05 |V2|=%.5f ang=%.4f"%(s[1],d(s[0])))
a_t=1.0; Yt=np.array([[yt,-yt],[-yt,yt]]); s=fsolve(m2,[0,1]); print("G17 tap a=1.00 |V2|=%.5f"%s[1])
# fault level parallel
print("G18 If two 0.2 sources=%.2f pu"%(1/(0.2*0.2/(0.4))))
# per-unit: generator rpm
print("G19 f=pN/120: 4 pole 1500 rpm -> %.1f Hz; hydro 24 pole -> N=%.1f rpm"%(4*1500/120,120*50/24))
# 3-phase sum zero
print("G20 balanced sum=",abs(1+a120+a120**2))
