import numpy as np, cmath, math
from scipy.optimize import fsolve, minimize
from scipy.integrate import solve_ivp
r2d=180/math.pi
def P(n,*a): print(n,*a)
def pol(z): return f"{abs(z):.5g}∠{cmath.phase(z)*r2d:.4f}deg"
s3=math.sqrt(3)
# 01
Sb=100e6;Vb=132e3;Zb=Vb**2/Sb;Ib=Sb/(s3*Vb)
P("PS01 Zb",Zb,"Ib",Ib,"20ohm pu",20/Zb,"50ohm pu",50/Zb)
# 02
x=0.15*(100/30)*(13.8/13.2)**2;P("PS02",x)
# 03: base 100MVA, 13.8kV at gen; T1 13.8/138, line 138, T2 138/69 load side
# gen 30MVA 13.8kV X=0.20; T1 50MVA 13.8/138 X=0.10; line 40+j100 ohm; T2 40MVA 138/69 X=0.08
Xg=0.20*(100/30);Xt1=0.10*(100/50);Zl=(40+100j)/(138**2/100);Xt2=0.08*(100/40)
P("PS03",Xg,Xt1,Zl,Xt2,"total",1j*(Xg+Xt1+Xt2)+Zl, "Vb line",13.8*138/13.8,"Vb load",69)
# 04
VL=400;Zp=30*cmath.exp(1j*math.radians(30));Iph=VL/abs(Zp);IL=s3*Iph
Pw=3*Iph**2*Zp.real;Q=3*Iph**2*Zp.imag
P("PS04 Iph",Iph,"IL",IL,"P",Pw,"Q",Q,"S",3*Iph**2*abs(Zp),"check",s3*VL*IL*math.cos(math.radians(30)))
# 05
Pl=500e3;V=440;f=50;w=2*math.pi*f
Qc=Pl*(math.tan(math.acos(.7))-math.tan(math.acos(.95)))
CY=Qc/(w*V**2);CD=Qc/(3*w*V**2)
P("PS05 Qc kvar",Qc/1e3,"C_Y/phase uF",CY*1e6,"C_D/phase uF",CD*1e6, "Q1",Pl*math.tan(math.acos(.7))/1e3,"Q2",Pl*math.tan(math.acos(.95))/1e3)
# 06 short line
Vr=132e3;Pr=50e6;pf=.8;Z=10+40j
Ir=Pr/(s3*Vr*pf)*(pf-1j*math.sqrt(1-pf**2))
Vrp=Vr/s3;Vs=Vrp+Z*Ir
VR=(abs(Vs)-Vrp)/Vrp*100
Ploss=3*abs(Ir)**2*Z.real
eff=Pr/(Pr+Ploss)*100
P("PS06 |Ir|",abs(Ir),"Vs LL kV",s3*abs(Vs)/1e3,"angle",cmath.phase(Vs)*r2d,"VR%",VR,"Ploss MW",Ploss/1e6,"eff%",eff)
# 07 nominal pi
Z=20+80j;Y=1j*5e-4
A=1+Y*Z/2;B=Z;C=Y*(1+Y*Z/4);D=A
P("PS07 A",A,pol(A),"B",pol(B),"C",C,"det",A*D-B*C)
Vr=132e3/s3;Pr=60e6;Ir=Pr/(s3*132e3*.85)*(0.85-1j*math.sqrt(1-.85**2))
Vs=A*Vr+B*Ir;Is=C*Vr+D*Ir
Vr0=abs(Vs)/abs(A)
P("PS07 Vs LL kV",s3*abs(Vs)/1e3,"Is",abs(Is),"VR%",(abs(Vs)/abs(A)-Vr)/Vr*100)
# 08 long line
l=300;z=0.1+0.5j;y=3.3e-6j
g=cmath.sqrt(z*y);Zc=cmath.sqrt(z/y);gl=g*l
A=cmath.cosh(gl);B=Zc*cmath.sinh(gl);C=cmath.sinh(gl)/Zc
P("PS08 gamma",g,"alpha",g.real,"beta",g.imag,"Zc",Zc,pol(Zc),"A",A,pol(A),"B",B,pol(B),"C",C,pol(C),"det",A*A-B*C)
Vs=220e3
P("PS08 Vr0 LL kV",Vs/abs(A)/1e3,"rise %",(Vs/abs(A)-Vs)/Vs*100,"rise wrt Vr0 %",(Vs-Vs/abs(A))/(Vs/abs(A))*100)
# pi equiv
Zp_=B;Ypp=(A-1)/B;P("PS08 equiv-pi Z",Zp_,"Y/2",Ypp)
# 09 SIL
L=1.0e-3;Cc=11e-9;Zc=math.sqrt(L/Cc);P("PS09 Zc",Zc,"SIL MW@400",400e3**2/Zc/1e6,"@220",220e3**2/Zc/1e6)
# 10 I2R vs V
Pm=100e6;R=10
for v in (132e3,220e3):
    I=Pm/(s3*v);P("PS10",v,I,3*I*I*R/1e6)
# 11 efficiency: PS06 eff
# 12 Ybus with charging
lines=[(1,2,0.02+0.06j,0.06),(1,3,0.08+0.24j,0.05),(2,3,0.06+0.18j,0.04)]
def ybus(lines,n):
    Yb=np.zeros((n,n),complex)
    for i,j,zz,b in lines:
        i-=1;j-=1;ys=1/zz
        Yb[i,i]+=ys+1j*b/2;Yb[j,j]+=ys+1j*b/2;Yb[i,j]-=ys;Yb[j,i]-=ys
    return Yb
Yb=ybus(lines,3);np.set_printoptions(precision=5,suppress=True,linewidth=150)
P("PS12 Ybus\n",Yb)
for i in range(3):
    for j in range(i,3):P("  Y%d%d"%(i+1,j+1),Yb[i,j],"G",Yb[i,j].real,"B",Yb[i,j].imag)
# 13 2-bus
V1=1.0;Z=0.05+0.15j;S=0.8+0.4j
Rr,X=Z.real,Z.imag;Pp,Qq=S.real,S.imag
bq=2*(Rr*Pp+X*Qq)-V1**2;cq=abs(Z)**2*abs(S)**2
disc=bq*bq-4*cq
x=(-bq+math.sqrt(disc))/2;x2=(-bq-math.sqrt(disc))/2
V2m=math.sqrt(x)
# angle: V2 = V1 - Z*conj(S)/conj(V2) ; with V2=|V2|e^{jd}: real/imag
# V1 V2* = |V2|^2 + Z S*  ->  V2* = (x+Z conj S)/V1
V2=np.conj((x+Z*np.conj(S))/V1)
I=np.conj(S/V2);P("PS13 |V2|",abs(V2),"ang",cmath.phase(V2)*r2d,"low root |V|",math.sqrt(x2),"check V1-ZI",V1-Z*I-V2,"loss",(abs(I)**2*Z))
P("   I",abs(I),"S1",V1*np.conj(I))
# 14-16 load flow
lf_lines=[(1,2,0.02+0.04j,0),(1,3,0.01+0.03j,0),(2,3,0.0125+0.025j,0)]
Yl=ybus(lf_lines,3)
Pd={2:2.566,3:0.0};Qd={2:1.102,3:0.0};Pg3=2.0
Psch=np.array([0,-2.566,2.0-0.0]);Qsch=np.array([0,-1.102,0]) # bus1 unused
# GS
V=np.array([1.05+0j,1+0j,1.05+0j])
def gs_step(V):
    V=V.copy()
    # bus2
    i=1;Sc=complex(Psch[i],Qsch[i])
    V[i]=(np.conj(Sc)/np.conj(V[i])-sum(Yl[i,k]*V[k] for k in range(3) if k!=i))/Yl[i,i]
    i=2
    Q=-np.imag(np.conj(V[i])*sum(Yl[i,k]*V[k] for k in range(3)))
    Sc=complex(Psch[i],Q)
    vn=(np.conj(Sc)/np.conj(V[i])-sum(Yl[i,k]*V[k] for k in range(3) if k!=i))/Yl[i,i]
    V[i]=1.05*vn/abs(vn)
    return V,Q
V1_,Q3=gs_step(V)
P("PS14 GS it1 V2",V1_[1],pol(V1_[1]),"V3",V1_[2],pol(V1_[2]),"Q3 used",Q3)
Vg=V.copy()
for it in range(500):
    Vn,_=gs_step(Vg)
    if max(abs(Vn-Vg))<1e-12:break
    Vg=Vn
P("GS converged its",it,"V",[pol(v) for v in Vg])
# NR
th=np.zeros(3);Vm=np.array([1.05,1.0,1.05])
def calc(Vm,th):
    Vc=Vm*np.exp(1j*th);S=Vc*np.conj(Yl@Vc);return S
def nr():
    th=np.zeros(3);Vm=np.array([1.05,1.0,1.05])
    for it in range(1,20):
        S=calc(Vm,th)
        mis=np.array([Psch[1]-S[1].real,Psch[2]-S[2].real,Qsch[1]-S[1].imag])
        mx=max(abs(mis))
        P("  NR iter",it-1,"mismatch",mx)
        if mx<1e-10:return th,Vm,it-1,mx
        # numeric jacobian
        def F(xv):
            t=th.copy();v=Vm.copy();t[1],t[2],v[1]=xv
            S=calc(v,t);return np.array([S[1].real,S[2].real,S[1].imag])
        x0=np.array([th[1],th[2],Vm[1]]);J=np.zeros((3,3))
        for k in range(3):
            d=1e-7;xp=x0.copy();xp[k]+=d;J[:,k]=(F(xp)-F(x0))/d
        dx=np.linalg.solve(J,mis);th[1]+=dx[0];th[2]+=dx[1];Vm[1]+=dx[2]
th,Vm,nit,mx=nr()
Vc=Vm*np.exp(1j*th)
S=calc(Vm,th)
P("PS15 NR V",[(round(m,5),round(t*r2d,4)) for m,t in zip(Vm,th)],"iters",nit,"final mis",mx)
P("   GS vs NR diff",max(abs(Vc-Vg)))
P("   slack S",S[0],"MW",S[0]*100,"Q3 gen",S[2].imag+0, "Pg3",S[2].real+0)
tot=0
for i,j,zz,b in lf_lines:
    Iij=(Vc[i-1]-Vc[j-1])/zz;Sij=Vc[i-1]*np.conj(Iij);Sji=Vc[j-1]*np.conj(-Iij);L=Sij+Sji;tot+=L
    P("  line",i,j,"Sij MVA",Sij*100,"Sji",Sji*100,"loss",L*100)
P("  total loss MVA",tot*100,"check P",(S[0]+S[1]+S[2]).real*100)
# Dispatch
def ed(a,b,c,Pd,pmin,pmax):
    lo,hi=-1e3,1e3
    for _ in range(200):
        lam=(lo+hi)/2
        Pg=np.clip((lam-b)/(2*c),pmin,pmax)
        if Pg.sum()<Pd:lo=lam
        else:hi=lam
    return lam,Pg
b=np.array([5.3,5.5,5.8]);c=np.array([.004,.006,.009]);a=np.array([500,400,200.])
inf=np.array([0,0,0.]);big=np.array([1e4]*3)
lam,Pg=ed(a,b,c,975,-big,big);cost=(a+b*Pg+c*Pg**2).sum()
P("PS20",lam,Pg,cost)
lam,Pg=ed(a,b,c,1000,np.array([200,150,100.]),np.array([450,350,300.]));cost=(a+b*Pg+c*Pg**2).sum()
P("PS21",lam,Pg,cost,"unconstrained",ed(a,b,c,1100,-big,big))
res=minimize(lambda p:(a+b*p+c*p**2).sum(),[300,300,300],constraints={'type':'eq','fun':lambda p:p.sum()-1000},bounds=[(200,450),(150,350),(100,300)]);P("  slsqp",res.x,res.fun)
# losses
a2=np.array([300,250.]);b2=np.array([8.0,9.0]);c2=np.array([0.004,0.005])
B11,B12,B22=1e-4,-2e-5,1.5e-4;PD=300.
def loss(p):return B11*p[0]**2+2*B12*p[0]*p[1]+B22*p[1]**2
def eqs(v):
    p1,p2,lam=v
    pl=loss((p1,p2))
    dl1=2*B11*p1+2*B12*p2;dl2=2*B12*p1+2*B22*p2
    return [b2[0]+2*c2[0]*p1-lam*(1-dl1),b2[1]+2*c2[1]*p2-lam*(1-dl2),p1+p2-PD-pl]
p1,p2,lam=fsolve(eqs,[150,150,10],xtol=1e-13)
pl=loss((p1,p2));pf1=1/(1-(2*B11*p1+2*B12*p2));pf2=1/(1-(2*B12*p1+2*B22*p2))
res=minimize(lambda p:(a2+b2*p+c2*p**2).sum(),[150,150],constraints={'type':'eq','fun':lambda p:p.sum()-PD-loss(p)},tol=1e-12)
P("PS22",p1,p2,lam,pl,"pf",pf1,pf2,"cost",(a2+b2*np.array([p1,p2])+c2*np.array([p1,p2])**2).sum(),"slsqp",res.x,"lossless",ed(a2,b2,c2,300,np.array([-1e4]*2),np.array([1e4]*2)))
# 23 swing
Sg=500;H=5;f0=60;dP=100
KE=H*Sg;ROCOF=(dP/Sg)*f0/(2*H);alpha=ROCOF*360
P("PS23 KE",KE,"ROCOF",ROCOF,"alpha elec deg/s2",alpha,"M MJ s/elecdeg",H*Sg/(180*f0))
# 24 EAC
Pm=.8;Pmax=1.8
d0=math.asin(Pm/Pmax);dm=math.pi-d0
cd=(Pm*(dm-d0)+Pmax*math.cos(dm))/Pmax;dcr=math.acos(cd)
tcr=math.sqrt(2*H*(dcr-d0)/(math.pi*f0*Pm))
P("PS24 d0",d0*r2d,"dmax",dm*r2d,"dcr",dcr*r2d,"tcr",tcr)
# integrate to verify
def cct(tc):
    def rhs(t,y):
        pe=0 if t<tc else Pmax*math.sin(y[0])
        return [y[1],math.pi*f0/H*(Pm-pe)]
    s=solve_ivp(rhs,[0,3],[d0,0],max_step=1e-3,rtol=1e-9,atol=1e-9)
    return s.y[0].max()>math.pi*1.0  # lost sync if exceeds pi well beyond
lo,hi=0.0,1.0
for _ in range(30):
    m=(lo+hi)/2
    def rhs(t,y,tc=m):
        pe=0 if t<tc else Pmax*math.sin(y[0]);return [y[1],math.pi*f0/H*(Pm-pe)]
    s=solve_ivp(rhs,[0,2],[d0,0],max_step=2e-4,rtol=1e-10,atol=1e-10)
    if s.y[0].max()>dm:hi=m
    else:lo=m
P("  numerical CCT",lo,hi)
# 25
R=0.05;D=0.8;dPpu=0.01;df=-dPpu/(1/R+D);P("PS25 df pu",df,"Hz@50",df*50)
# 26
R1=.04*50/500;R2=.05*50/300;dP=100
dfp=-dP/(1/R1+1/R2);P("PS26 df",dfp,"dP1",-dfp/R1,"dP2",-dfp/R2)
# 27 / 28
Vt=1.0;I=1.0*(0.8-0.6j);Xs=1.2
E=Vt+1j*Xs*I;P("PS27 E",E,pol(E))
P("   phase kV for 11kV LL",11/s3*abs(E),"LL kV",11*abs(E))
Pmx=abs(E)*Vt/Xs;P("PS28 Pmax pu",Pmx,"MW @10MVA",Pmx*10,"P@30deg",Pmx*.5,"P at delta",abs(E)*math.sin(cmath.phase(E))/Xs, "check P",(E*np.conj(I)).real if False else (Vt*np.conj(I)).real)
# FAULTS (appended): base 100 MVA, 138 kV line zone; gen 100MVA 13.8kV X1=.15 X2=.17 X0=.05; T 100MVA 13.8D/138Yg X=.10; line X1=X2=40ohm, X0=120ohm
Zb=138**2/100;Ib=100/(s3*138)
xl1=40/Zb;xl0=120/Zb
Z1=.15+.10+xl1;Z2=.17+.10+xl1;Z0=.10+xl0
If3=1/Z1;P("PS17 Zb",Zb,"Ib kA",Ib,"xl1",xl1,"xl0",xl0,"Z1",Z1,"If3 pu",If3,"kA",If3*Ib,"MVA",100*If3)
Ia=3/(Z0+Z1+Z2);P("PS18 Z1 Z2 Z0",Z1,Z2,Z0,"Ia pu",Ia,"kA",Ia*Ib,"Va_b? I0",Ia/3,"Vb pre?")
Ib_=s3/(Z1+Z2);P("PS19 LL Ib pu",Ib_,"kA",Ib_*Ib)
