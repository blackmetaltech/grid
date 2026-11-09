import numpy as np, cmath
from math import *
print('--- L03')
for rk,doc in ((.727,5.03),(.524,3.63),(.387,2.68)):
    R=rk*2;P=5000;V=380
    naive=(P/V)**2*R/P*100
    # source fixed 380, constant-power load
    I=(V-sqrt(V*V-4*R*P))/(2*R);lossS=I*I*R;
    # load fixed at 380 V
    Il=P/V;
    print(f'{rk}: doc {doc}; naive (P/V)^2R/P={naive:.4f}; naive % of... ; Vs=380 CP: I={I:.4f} Vload={V-I*R:.3f} loss/Pload={lossS/P*100:.4f} loss/Psrc={lossS/(P+lossS)*100:.4f} ; load@380: loss/Pload={naive:.4f} loss/Psrc={Il*Il*R/(P+Il*Il*R)*100:.4f}; R*P/V^2={R*P/V**2*100:.4f}')
print('--- L01 (see G-02)')
for rk,l in ((.727,.3),(1.83,.12)):
    Rc=rk*2*l;I=48/(Rc+4.8);print(rk,l,I*4.8,100*(1-I*4.8/48),I)
print('--- L07')
Vb=11e3;zl=4*(1.1255+.377j)
Pm,pfm=1.2e6,.7;Pv,pfv=.5e6,.95
Sm=Pm*(1+1j*tan(acos(pfm)));Sv=Pv*(1+1j*tan(acos(pfv)));SL=Sm+Sv
print('SL',SL,abs(SL),'pf',SL.real/abs(SL), 'Qc rule Pm: ',1.2*(tan(acos(.7))-tan(acos(.95))))
Vs=1.03*Vb/sqrt(3)
def solve(Qc,mode,Q2=True):
    V=Vs
    for _ in range(500):
        Sc=SL-1j*Qc*(abs(V)/(Vb/sqrt(3)))**2 if mode=='V2' else SL-1j*Qc
        I=np.conj(Sc/(3*V)); V=Vs-zl*I
    return V,I
for lab,Qc,m in (('none',0,'c'),('0.9 const-Q',.9e6,'c'),('0.9 Q~V^2',.9e6,'V2')):
    V,I=solve(Qc,m);print(lab,'|I|=',abs(I),'A  Vfar pu',abs(V)*sqrt(3)/Vb,'LL kV',abs(V)*sqrt(3)/1e3,'ang',degrees(cmath.phase(V)),' loss kW',3*abs(I)**2*zl.real/1e3)
print('Weasel rating 115 A')
# constant impedance load variant
Zl=abs(11e3)**2/np.conj(SL)  # at 1.0pu
V=Vs*(Zl/(Zl+zl/1));
print('const-Z (at 1pu) variant, no cap: V far pu',abs(Zl/3*0+1)) if False else None
print('--- L15')
l=350;z=.0347+.327j;y=3.43e-6j
g=cmath.sqrt(z*y);Zc=cmath.sqrt(z/y);A=cmath.cosh(g*l);B=Zc*cmath.sinh(g*l);C=cmath.sinh(g*l)/Zc
print('gamma l',g*l,'Zc',Zc,'A',A,abs(A),'|B|',abs(B))
print('V_R0 kV',400/abs(A))
Vr0=400/abs(A);print('rise %',(Vr0/400-1)*100)
# charging MVAr: nominal  b*l*V^2
Q=3.43e-6*l*400**2;print('nominal charging MVAr at 400 kV',Q)
# with exact: sending end Q at no load: Is = C*Vr0 ; Qs = 3 Vs Is* ... 
Vsp=400e3/sqrt(3);Vrp=Vsp/A;Is=C*Vrp;Ss=3*Vsp*np.conj(Is);print('exact no-load sending-end S MVA',Ss/1e6)
print('charging at Vr0 : ',3.43e-6*l*(Vr0)**2, 'with avg ',)
print('--- L13')
E=1+1j*1.2*cmath.exp(-1j*acos(.8));print(abs(E),degrees(cmath.phase(E)),abs(E)/1.2)
S=.8-.2j;I=np.conj(S);E=1+1j*1.2*I;print('night E',abs(E),degrees(cmath.phase(E)),'Pmax',abs(E)/1.2,'I',abs(I),'pf', .8/abs(S))
