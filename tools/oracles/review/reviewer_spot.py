import math, cmath, numpy as np
from scipy.optimize import brentq, fsolve
from scipy.linalg import expm
d=math.degrees; out=[]
def rep(i,q,doc,val): out.append((i,q,doc,val,abs(val-doc)/abs(doc) if doc else abs(val)))
# AC-05/06/07
w=2*math.pi*50; R=3; XL=w*25.48e-3; XC=1/(w*796e-6); Z=complex(R,XL-XC)
rep('AC-05','|Z|',5.005,abs(Z)); rep('AC-06','phi deg',53.17,d(cmath.phase(Z)))
I=230/abs(Z); rep('AC-07','I',45.96,I); rep('AC-07','pf',0.5994,R/abs(Z)); rep('AC-07','P',6336,I*I*R)
# AC-08
Z=complex(100,-1/(w*20e-6)); rep('AC-08','|Z|',187.96,abs(Z)); rep('AC-08','lead deg',57.86,-d(cmath.phase(Z))); rep('AC-08','I',1.170,220/abs(Z))
# AC-12
XL=w*80e-3; XC=1/(w*60e-6); rep('AC-12','Irms',8.238,230/abs(XL-XC))
# AC-17
e0=20*0.03*math.pi*0.08**2*50; rep('AC-17','e0',0.6032,e0); rep('AC-17','Pavg',0.01819,e0*e0/10/2)
# AC-20
rep('AC-20','f',176.8,1/(2*math.pi*math.sqrt(27e-3*30e-6)))
# PS-05
P=500e3; Qc=P*(math.tan(math.acos(.7))-math.tan(math.acos(.95))); rep('PS-05','Qc kvar',345.8,Qc/1e3)
CY=Qc/(2*math.pi*50*440**2); rep('PS-05','C_Y uF',5685,CY*1e6); rep('PS-05','C_D uF',1895,CY/3*1e6)
# PS-08 long line
z=complex(.1,.5); y=1j*3.3e-6; g=cmath.sqrt(z*y); Zc=cmath.sqrt(z/y); A=cmath.cosh(g*300)
rep('PS-08','A re',0.92663,A.real); rep('PS-08','|Zc|',393.08,abs(Zc)); rep('PS-08','VR0',237.39,220/abs(A))
# PS-09
Zc=math.sqrt(1e-3/11e-9); rep('PS-09','Zc',301.5,Zc); rep('PS-09','SIL400',530.7,400**2/Zc)
# PS-13
R,X,P,Q=.05,.15,.8,.4; b=2*(R*P+X*Q)-1; c=(R*R+X*X)*(P*P+Q*Q); v2=math.sqrt((-b+math.sqrt(b*b-4*c))/2); rep('PS-13','|V2|',0.87987,v2)
# PS-15/16 NR with analytic-free newton via fsolve
zs={(0,1):.02+.04j,(0,2):.01+.03j,(1,2):.0125+.025j}; Y=np.zeros((3,3),complex)
for (i,k),zz in zs.items(): yy=1/zz; Y[i,i]+=yy;Y[k,k]+=yy;Y[i,k]-=yy;Y[k,i]-=yy
def F(x):
    V=np.array([1.05,x[2]*np.exp(1j*x[0]),1.05*np.exp(1j*x[1])]); S=V*np.conj(Y@V)
    return [S[1].real+2.566,S[2].real-2.0,S[1].imag+1.102]
x=fsolve(F,[0,0,1],xtol=1e-14); V=np.array([1.05,x[2]*np.exp(1j*x[0]),1.05*np.exp(1j*x[1])]); S=V*np.conj(Y@V)
rep('PS-15','|V2|',1.01334,x[2]); rep('PS-15','ang2',-1.3772,d(x[0])); rep('PS-15','ang3',0.4751,d(x[1]))
rep('PS-16','slackP',62.565,S[0].real*100); rep('PS-16','slackQ',61.290,S[0].imag*100); rep('PS-16','loss',5.965,S.sum().real*100)
# PS-14 GS iter 1
V=np.array([1.05,1,1.05],complex); Ssch2=complex(-2.566,-1.102)
V2=(np.conj(Ssch2)/np.conj(V[1]) - Y[1,0]*V[0]-Y[1,2]*V[2])/Y[1,1]; V[1]=V2
Q3=-np.imag(np.conj(V[2])*(Y[2]@V)); V3=(complex(2.0,-Q3)/np.conj(V[2]) - Y[2,0]*V[0]-Y[2,1]*V[1])/Y[2,2]
rep('PS-14','V2 re',1.01331,V2.real); rep('PS-14','V2 im',-0.03100,V2.imag); rep('PS-14','Q3',0.71206,Q3); rep('PS-14','ang V3',0.2433,d(cmath.phase(V3)))
# PS-17/18: base 100MVA; line 40 ohm @138
Zb=138**2/100; xl=40/Zb; Z1=.15+.10+xl; rep('PS-17','Z1',0.46,Z1); If=1/Z1; Ib=100/(math.sqrt(3)*138); rep('PS-17','If kA',0.9094,If*Ib)
Z2=.17+.10+xl; Z0=.10+120/Zb; Ia=3/(Z1+Z2+Z0); rep('PS-18','Z0',0.7301,Z0); rep('PS-18','Ia kA',0.7515,Ia*Ib)
rep('PS-19','Ib pu',1.8425,math.sqrt(3)/(Z1+Z2))
# PS-20
a=[(5.3,.004),(5.5,.006),(5.8,.009)]
lam=brentq(lambda l: sum((l-b_)/(2*c_) for b_,c_ in a)-975,5,20); rep('PS-20','lambda',9.163,lam)
Ps=[(lam-b_)/(2*c_) for b_,c_ in a]; cost=sum(f+b_*p+c_*p*p for (b_,c_),p,f in zip(a,Ps,[500,400,200])); rep('PS-20','cost',8228.03,cost)
# PS-21
lims=[(200,450),(150,350),(100,300)]
def disp(l): return [min(max((l-b_)/(2*c_),lo),hi) for (b_,c_),(lo,hi) in zip(a,lims)]
lam=brentq(lambda l: sum(disp(l))-1000,5,20); rep('PS-21','lambda',9.580,lam); rep('PS-21','P2',340,disp(lam)[1])
# PS-24
Pm,Pmax,H,f0=.8,1.8,5,60; d0=math.asin(Pm/Pmax); dm=math.pi-d0
dcr=math.acos((Pm*(dm-d0)+Pmax*math.cos(dm))/Pmax); tcr=math.sqrt(4*H*(dcr-d0)/(2*math.pi*f0*Pm))
rep('PS-24','dcr',84.77,d(dcr)); rep('PS-24','tcr',0.2600,tcr)
# PS-25/26
rep('PS-25','df',-0.02404,-0.01/(1/.05+.8)*50)
beta=500/.04+300/.05; df=-100/beta*50/50
# beta in MW per pu freq: S/R; df pu = -100/beta ; Hz = *50
dfpu=-100/(500/.04+300/.05); rep('PS-26','df Hz',-0.2703,dfpu*50); rep('PS-26','P1',67.57,-dfpu*500/.04)
# PS-27/28
E=1+1j*1.2*cmath.rect(1,-math.acos(.8)); rep('PS-27','E',1.9698,abs(E)); rep('PS-27','delta',29.17,d(cmath.phase(E))); rep('PS-28','Pmax',1.6415,abs(E)/1.2)
# PS-23
rep('PS-23','rocof',1.2,0.2*60/(2*5))
# G-04
h=1/math.sqrt(.07); rep('G-04','series h',3.780,h)
# parallel resonance with detuned: Xs=1/50 pu on 2 MVA... S_sc 50, Qc 2: Xs = 2/50=0.04 (on Qc base), Xc=1, XL=.07
Xs=2/50; XLr=.07; hp=math.sqrt(1/(Xs+XLr)); rep('G-04','parallel h',3.015,hp); rep('G-04','Qeff',2.1505,2/(1-.07))
# G-05
a_=cmath.rect(1,math.radians(120)); IN=10+6*a_**2+4*a_; rep('G-05','|IN|',5.2915,abs(IN)); rep('G-05','ang',-19.11,d(cmath.phase(IN)))
# G-06/07
t=lambda tms,M,k=.14,al=.02: tms*k/(M**al-1); rep('G-06','t',0.2971,t(.1,10)); rep('G-07','TMS2',0.1649,(0.2971+0.3)/t(1,4000/600))
rep('G-07','VI',0.15,t(.1,10,13.5,1)); rep('G-07','EI',0.0808,t(.1,10,80,2))
# G-08
rep('G-08','P',0.8554,3*(8**3-27)/(12**3-27))
# G-09
rep('G-09','dSoC',53.916,50/math.sqrt(.86))
# G-11
beta=2*math.pi*50*math.sqrt(1e-3*11e-9); rep('G-11','rise%',5.093,(1/math.cos(beta*300)-1)*100)
# G-12 analytic: states dw, v ; 2H dw = -v - dPL - D dw ; TG dv = -dw/R - v
H,D,Rr,TG,dP=5,1,.05,.5,.1
Am=np.array([[-D/(2*H),1/(2*H)],[-1/(Rr*TG),-1/TG]]); Bv=np.array([-dP/(2*H),0])
def resp(t): 
    M=np.zeros((3,3)); M[:2,:2]=Am; M[:2,2]=Bv; return (expm(M*t)@np.array([0,0,1]))[:2]
rep('G-12','df(1s)',-0.302584,resp(1)[0]*50); ts=np.linspace(0,5,50001); fs=[resp(tt)[0]*50 for tt in ts[::10]]
rep('G-12','nadir',-0.30752,min(fs)); rep('G-12','ss',-0.238095,-dP/(D+1/Rr)*50)
# G-13
T=2; s=lambda t: 1-3*math.exp(-t/(0.5*T)); rep('G-13','y(1)',-0.10364,s(1))
# G-14
rep('G-14','Pdc',73.6,100*.8*(1-.004*20))
# G-17
def v2(tau):
    def F(u):
        V=u[0]*cmath.exp(1j*u[1]); Vs=1/tau; I=(Vs-V)/(0.1j); S=V*I.conjugate()-complex(.5,.2); return [S.real,S.imag]
    return fsolve(F,[1,0])[0]
rep('G-17','tau1.05',0.92934,v2(1.05)); rep('G-17','tau1',0.97825,v2(1.0))
# G-16 USD
rep('G-16$','$/MWh',26.78,10.3*2.6)
for r in out: print("%-6s %-10s doc=%-10g mine=%-12.6g rel=%.2e %s"%(r[0],r[1],r[2],r[3],r[4],'OK' if r[4]<3e-3 else '<<<'))
print(len(out),'checks', sum(r[4]<3e-3 for r in out),'ok')
