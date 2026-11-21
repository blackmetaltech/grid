import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from scipy.optimize import fsolve, brentq
from scipy.integrate import solve_ivp
rho=1.724e-8
Rc=rho*600/2.5e-6;I=48/(Rc+4.8);R('G-01','Rc',4.138,Rc,1e-3);R('G-01','I',5.371,I,1e-3);R('G-01','V',25.78,I*4.8,1e-3)
Rc=7.41*.6;I=48/(Rc+4.8);R('G-01b','Rc',4.446,Rc,1e-3);R('G-01b','I',5.191,I,1e-3);R('G-01b','V',24.92,I*4.8,1e-3);R('G-01b','loss%',48.1,100*(1-I*4.8/48),1e-3)
for rk,l,doc,dl in ((.727,.3,44.00,8.33),(1.83,.12,43.98,8.38)):
    Rc=rk*2*l;I=48/(Rc+4.8);V=I*4.8;R('G-02',f'V {rk}/{l}',doc,V,1e-3);R('G-02','loss%',dl,100*(1-V/48),1e-3,'loss as voltage drop %')
    print('   line I2R loss % of source power:',100*Rc/(Rc+4.8))
# G-03
R('G-03','hr',5,sqrt(50/2),1e-6);R('G-03','fr',250,50*sqrt(25))
R('G-04','h series',3.780,1/sqrt(.07),1e-4);R('G-04','h par',3.015,1/sqrt(.04+.07),1e-4);R('G-04','Qeff',2.1505,2/(1-.07),1e-4)
Ia=10;Ib=6*cmath.exp(-2j*pi/3);Ic=4*cmath.exp(2j*pi/3);IN=Ia+Ib+Ic
R('G-05','|IN|',5.2915,abs(IN),1e-4);R('G-05','ang',-19.11,d(cmath.phase(IN)),1e-4,'note IN=sum (return current is -IN)')
t=.1*.14/(10**.02-1);R('G-06','t',.2971,t,1e-4)
M2=4000/600;t2=.2971+.3;tms=t2/(.14/(M2**.02-1));R('G-07','TMS2',.1649,tms,1e-3,'using rounded .2971');
t1=.1*.14/(10**.02-1);tms=(t1+.3)/(.14/(M2**.02-1));print('  unrounded',tms)
R('G-07','VI',.15,.1*13.5/9,1e-3);R('G-07','EI',.0808,.1*80/99,1e-3)
R('G-08','P',.8554,3*(8**3-27)/(12**3-27),1e-4);R('G-09','dSoC',53.916,50/.86**.5,1e-5)
R('G-10','Pmax',3.3333,1/(2*.15),1e-4);R('G-10','Vn',.7071,sqrt(.5),1e-4)
b=2*pi*50*sqrt(1e-3*11e-9);R('G-11','beta',1.04195e-3,b,1e-4);R('G-11','rise',5.093,(1/cos(b*300)-1)*100,1e-4)
# G-12
H,D,Rr,TG,dPL=5,1,.05,.5,.1
def rhs(t,x):
    df,dPm=x
    return [(dPm-dPL-D*df)/(2*H),(-df/Rr-dPm)/TG]
sol=solve_ivp(rhs,[0,10],[0,0],rtol=1e-12,atol=1e-14,dense_output=True,max_step=.001)
fn=lambda t:sol.sol(t)[0]*50
tt=np.linspace(0,5,500001);v=sol.sol(tt)[0]*50;i=v.argmin()
R('G-12','df(1s)',-.302584,fn(1),1e-5,absol=True);R('G-12','nadir',-.30752,v[i],1e-5,absol=True);print('  t_nadir',tt[i],'doc 1.174')
R('G-12','dfss',-.238095,-dPL/(1/Rr+D)*50,1e-5,absol=True);R('G-12','RoCoF0',-.5,-dPL/(2*H)*50,1e-4)
y0=-2;y1=1-3*exp(-1);R('G-13','y0',-2,y0,1e-5,absol=True);R('G-13','y1',-.10364,y1,1e-5,absol=True)
R('G-14','P',73.6,100*.8*(1-.004*20),1e-6);R('G-15','THD',5,sqrt(4**2+3**2),1e-6)
R('G-16','INR',2266,10.3/3.6*1000*220/1000*1/1,1e-6,'MJ/kWh*220 Rs/GJ -> Rs/MWh: 10.3 MJ/kWh=10300 MJ/MWh=10.3 GJ/MWh *220')
print('G-16 exact',10.3*220,' USD',10.3*2.60)
# G-17
def tapV(tau):
    S=.5+.2j
    def f(x):
        V2=x[0]+1j*x[1]; I=np.conj(S/V2); Vs=1/tau
        r=Vs-1j*.1*I-V2   # x on secondary side
        return [r.real,r.imag]
    s=fsolve(f,[1,0],xtol=1e-14);return abs(s[0]+1j*s[1])
def tapV2(tau):
    S=.5+.2j
    def f(x):
        V2=x[0]+1j*x[1]; I=np.conj(S/V2)
        r=1-1j*.1*tau*I*tau-V2*tau  # x on primary side: V1 = tau V2 + jx I_primary , I_p=I/tau ... 
        return [r.real,r.imag]
    s=fsolve(f,[1,0],xtol=1e-14);return abs(s[0]+1j*s[1])
print('G-17 x on sec',tapV(1.05),tapV(1.0),'doc .92934 vs .97825')
# primary-side x: V1 = jx*I1 + tau*V2, I1=I2/tau
def tapV3(tau):
    S=.5+.2j
    def f(x):
        V2=x[0]+1j*x[1];I2=np.conj(S/V2);I1=I2/tau
        r=1-1j*.1*I1-tau*V2;return [r.real,r.imag]
    s=fsolve(f,[1,0],xtol=1e-14);return abs(s[0]+1j*s[1])
print('G-17 x on pri',tapV3(1.05),tapV3(1.0))
# pi model off-nominal: y=1/(jx); Y = [[y/tau^2, -y/tau],[-y/tau,y]] 
def tapV4(tau):
    S=.5+.2j;y=1/(1j*.1)
    def f(x):
        V2=x[0]+1j*x[1];I2=np.conj(S/V2)*-1*-1
        # I2 into bus2 from network = -conj(S/V2)
        Iin=-np.conj(S/V2);r=-y/tau*1+y*V2-Iin;return [r.real,r.imag]
    s=fsolve(f,[1,0],xtol=1e-14);return abs(s[0]+1j*s[1])
print('G-17 pi-model tap on bus1 side',tapV4(1.05),tapV4(1.0))
R('G-18','If',10,1/(.2/2),1e-9,'two 0.2 pu sources in parallel => 0.1 pu => 10 pu')
R('G-19','f',50,4*1500/120,0);R('G-19','rpm',250,120*50/24,0)
a=cmath.exp(2j*pi/3);R('G-20','1+a+a2',0,abs(1+a+a*a),1e-12,absol=True)
