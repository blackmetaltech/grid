import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from scipy.optimize import fsolve, brentq
# 3-bus
z={(1,2):.02+.04j,(1,3):.01+.03j,(2,3):.0125+.025j}
Y=np.zeros((3,3),complex)
for (i,j),zz in z.items():
    i-=1;j-=1;y=1/zz;Y[i,i]+=y;Y[j,j]+=y;Y[i,j]-=y;Y[j,i]-=y
V1=1.05;S2=-(2.566+1.102j);P3=2.0
V2=1+0j;V3=1.05+0j
# GS iter 1
V2n=(np.conj(S2)/np.conj(V2)-Y[1,0]*V1-Y[1,2]*V3)/Y[1,1]
Q3=-(np.conj(V3)*(Y[2,0]*V1+Y[2,1]*V2n+Y[2,2]*V3)).imag
V3n=((P3-1j*Q3)/np.conj(V3)-Y[2,0]*V1-Y[2,1]*V2n)/Y[2,2]
print('PS-14 V2',V2n,'doc 1.01331-0.03100j; Q3',Q3,'doc .71206; ang3 before rescale',d(cmath.phase(V3n)),'doc 0.2433')
# Q3 using V2 old?
Q3b=-(np.conj(V3)*(Y[2,0]*V1+Y[2,1]*V2+Y[2,2]*V3)).imag
print(' Q3 using old V2:',Q3b)
# GS: iterate Q3 with new V2 = standard (Saadat uses V2 new). 
# NR via solving
def mism(x):
    t2,t3,v2=x
    V=np.array([V1,v2*cmath.exp(1j*t2),1.05*cmath.exp(1j*t3)])
    S=V*np.conj(Y@V)
    return [S[1].real-S2.real,S[1].imag-S2.imag,S[2].real-P3]
sol=fsolve(mism,[0,0,1],xtol=1e-14);t2,t3,v2=sol
V=np.array([V1,v2*cmath.exp(1j*t2),1.05*cmath.exp(1j*t3)]);S=V*np.conj(Y@V)
R('PS-15','|V2|',1.01334,v2,1e-5,absol=True);R('PS-15','ang2',-1.3772,d(t2),1e-3,absol=True);R('PS-15','ang3',.4751,d(t3),1e-3,absol=True)
R('PS-16','slackP MW',62.565,S[0].real*100,1e-4);R('PS-16','slackQ',61.290,S[0].imag*100,1e-4);R('PS-16','Q3',60.915,S[2].imag*100,1e-4)
def Sij(i,j):
    i-=1;j-=1;I=(V[i]-V[j])/z[(i+1,j+1)] if (i+1,j+1) in z else (V[i]-V[j])/z[(j+1,i+1)];return V[i]*np.conj(I)*100
s12=Sij(1,2);s23=Sij(2,3);print('S12',s12,'S23',s23)
R('PS-16','S12P',89.951,s12.real,1e-4);R('PS-16','S12Q',52.035,s12.imag,1e-4);R('PS-16','S23P',-168.608,s23.real,1e-4);R('PS-16','S23Q',-62.083,s23.imag,1e-4)
loss=S.sum()*100;R('PS-16','lossP',5.965,loss.real,1e-4);R('PS-16','lossQ',12.005,loss.imag,1e-4)
# NR iterations count
def nr():
    x=np.array([0,0,1.0]);
    for k in range(1,10):
        f=np.array(mism(x));
        if max(abs(f))<1e-6: return k-1
        J=np.zeros((3,3))
        for c in range(3):
            dx=np.zeros(3);dx[c]=1e-7;J[:,c]=(np.array(mism(x+dx))-f)/1e-7
        x=x-np.linalg.solve(J,f)
print('NR iterations to 1e-6:',nr())
# faults 100MVA
Zb=138**2/100;Ib=100e3/(sqrt(3)*138)
xl=40/Zb;Z1=.15+.10+xl;If=1/Z1
R('PS-17','Z1',.46,Z1,1e-4);R('PS-17','If pu',2.1737,If,1e-4);R('PS-17','kA',.9094,If*Ib/1e3,1e-4);R('PS-17','MVA',217.4,If*100,1e-4)
Z2=.17+.10+xl;Z0=.10+120/Zb
R('PS-18','Z2',.48,Z2,1e-4);R('PS-18','Z0',.7301,Z0,1e-4);Ia=3/(Z1+Z2+Z0);R('PS-18','Ia',1.7962,Ia,1e-4);R('PS-18','kA',.7515,Ia*Ib/1e3,1e-4)
Ib_=sqrt(3)/(Z1+Z2);R('PS-19','Ib pu',1.8425,Ib_,1e-4);R('PS-19','kA',.7708,Ib_*Ib/1e3,1e-4)
print('  note PS-17 If with Z1 rounded 0.46:',1/.46)
# ED
def ed(c,D,lim=None,B=None):
    pass
a=[(5.3,.004),(5.5,.006),(5.8,.009)]
def P_of(l,i,lim=None):
    p=(l-a[i][0])/(2*a[i][1]); 
    if lim: p=min(max(p,lim[i][0]),lim[i][1])
    return p
l=brentq(lambda l:sum(P_of(l,i) for i in range(3))-975,1,50);Ps=[P_of(l,i) for i in range(3)]
cost=lambda Ps:sum(c0+b*p+q*p*p for (c0,(b,q),p) in zip((500,400,200),a,Ps))
R('PS-20','lambda',9.163,l,1e-4);print(' P',Ps,'doc 482.89/305.26/186.84');R('PS-20','cost',8228.03,cost(Ps),1e-4)
lim=[(200,450),(150,350),(100,300)]
l=brentq(lambda l:sum(P_of(l,i,lim) for i in range(3))-1000,1,50);Ps=[P_of(l,i,lim) for i in range(3)]
print(' PS-21 lambda',l,Ps,cost(Ps),'doc 9.580; 450/340/210; 8473.5')
l_=(1000-450-0)  # check
# PS-21 detail: P1 at limit 450, P2,P3 share 550: 
l3=brentq(lambda l:P_of(l,1)+P_of(l,2)-550,1,50);print('  lambda for P2,P3 sharing 550:',l3,P_of(l3,1),P_of(l3,2))
# PS-22
def eqs(x):
    p1,p2,lam=x
    PL=1e-4*p1**2+2*(-2e-5)*p1*p2+1.5e-4*p2**2
    dP1=2e-4*p1-4e-5*p2;dP2=-4e-5*p1+3e-4*p2
    return [8+.008*p1-lam*(1-dP1),9+.01*p2-lam*(1-dP2),p1+p2-PL-300]
p1,p2,lam=fsolve(eqs,[200,100,10],xtol=1e-14);PL=1e-4*p1**2-4e-5*p1*p2+1.5e-4*p2**2
R('PS-22','P1',213.67,p1,1e-4);R('PS-22','P2',91.365,p2,1e-4);R('PS-22','lam',10.104,lam,1e-4);R('PS-22','PL',5.0368,PL,1e-4)
print('  Bmn in MW^-1 units with P in MW: yes (1e-4*P^2)')
R('PS-23','KE',2500,5*500);R('PS-23','RoCoF',1.2,.2*60/(2*5),1e-4)
# PS-24
Pm=.8;Pmax=1.8;d0=asin(Pm/Pmax);dm=pi-d0
dcr=acos((Pm/Pmax)*(dm-d0)*0+ (Pm/Pmax)*(dm-d0)+cos(dm)) if False else acos((Pm*(dm-d0)+0*1+Pmax*cos(dm))/Pmax)
tcr=sqrt(4*5*(dcr-d0)/(2*pi*60*Pm)*1) 
# swing: (2H/ws) d2d = Pm ; ws=2pi60 ; d-d0 = Pm*ws/(4H) t^2
tcr=sqrt((dcr-d0)*4*5/(2*pi*60*Pm))
R('PS-24','d0',26.39,d(d0),1e-3);R('PS-24','dcr',84.77,d(dcr),1e-3);R('PS-24','tcr',.26,tcr,1e-3)
# RK4
ws=2*pi*60;H=5
def sim(tc,dt=1e-4):
    x=d0;w=0;t=0
    # fault on until tc, then post fault Pe=Pmax sin d ; check stability
    while t<tc: w+=ws/(2*H)*Pm*dt;x+=w*dt;t+=dt   # Euler-ish
    while t<2:
        w+= ws/(2*H)*(Pm-Pmax*sin(x))*dt; x+=w*dt;t+=dt
        if x>pi: return False
        if w<0: return True
    return True
print(' PS-24 sim check tc=0.2599 stable',sim(.2599),' 0.2602',sim(.2602))
# PS-25
R('PS-25','df',-.02404,-.01/(1/.05+.8)*50,1e-4)
S1,S2_=500/.04,300/.05;df=-100/(S1+S2_)*50;R('PS-26','df',-.2703,df,1e-4);R('PS-26','P1',67.57,-df/50*S1,1e-4);R('PS-26','P2',32.43,-df/50*S2_,1e-4)
Xs=1.2;I=1*cmath.exp(-1j*acos(.8));E=1+1j*Xs*I
R('PS-27','|E|',1.9698,abs(E),1e-4);R('PS-27','delta',29.17,d(cmath.phase(E)),1e-4)
R('PS-28','Pmax',1.6415,1.9698/1.2,1e-4);R('PS-28','P(29.17)',.8,1.9698/1.2*sin(radians(29.17)),1e-4)
print('E exact',abs(E),d(cmath.phase(E)),abs(E)/1.2)
