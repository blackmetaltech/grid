import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
Zb=132**2/100;Ib=100e3/(sqrt(3)*132)
R('PS-01','Zb',174.2,Zb);R('PS-01','Ib',437.4,Ib);R('PS-01','20',0.1148,20/Zb);R('PS-01','50',.2870,50/Zb)
R('PS-02','x',.5465,.15*(100/30)*(13.8/13.2)**2)
Zb2=138**2/100
R('PS-03','gen',.6667,.2*100/30);R('PS-03','T1',.2,.1*100/50);R('PS-03','line r',.21,40/Zb2);R('PS-03','line x',.5251,100/Zb2);R('PS-03','T2',.2,.08*100/40)
Z=30*cmath.exp(1j*pi/6);Ip=400/30;S=3*400**2/np.conj(Z)
R('PS-04','Iph',13.33,Ip);R('PS-04','IL',23.09,Ip*sqrt(3));R('PS-04','P',13.86,S.real/1e3);R('PS-04','Q',8.0,S.imag/1e3*-1 if S.imag<0 else S.imag/1e3)
Qc=500*(tan(acos(.7))-tan(acos(.95)));R('PS-05','Qc',345.8,Qc,1e-3)
CY=Qc*1e3/(3*(440/sqrt(3))**2*2*pi*50)*1e6;R('PS-05','C_Y per phase',5685,CY,1e-3);R('PS-05','C_D',1895,CY/3,1e-3)
# PS-06
Z=10+40j;P=50e6;V=132e3/sqrt(3);I=P/(3*V*.8)*cmath.exp(-1j*acos(.8))
VS=V+Z*I;R('PS-06','VS',147.67,abs(VS)*sqrt(3)/1e3,1e-3);R('PS-06','delta',4.782,d(cmath.phase(VS)),1e-3)
VR=(abs(VS)-V)/V*100;R('PS-06','VR',11.87,VR,1e-3);loss=3*abs(I)**2*10;R('PS-06','loss',2.242,loss/1e6,1e-3);R('PS-06','eta',95.71,100*P/(P+loss),1e-3)
R('PS-11','eta',95.71,100*P/(P+loss),1e-3);R('PS-11','loss',2.242,loss/1e6,1e-3)
# PS-07
Z=20+80j;Y=5e-4j;A=1+Z*Y/2;B=Z
R('PS-07','A re',.98,A.real,1e-3);R('PS-07','A im',.005,A.imag,1e-3);R('PS-07','|B|',82.46,abs(B),1e-3);R('PS-07','argB',75.96,d(cmath.phase(B)),1e-3)
V=132e3/sqrt(3);I=60e6/(3*V*.85)*cmath.exp(-1j*acos(.85));C=Y*(1+Z*Y/4)
VS=A*V+B*I;R('PS-07','VS',164.0,abs(VS)*sqrt(3)/1e3,1e-3)
# VR at no load: V_R0 = VS/A
VR0=abs(VS)/abs(A);R('PS-07','VR',26.79,(VR0-V)/V*100,1e-3)
# PS-08
z=.1+.5j;y=3.3e-6j;l=300;g=cmath.sqrt(z*y);Zc=cmath.sqrt(z/y);A=cmath.cosh(g*l)
R('PS-08','A re',.92663,A.real,1e-3);R('PS-08','A im',.014485,A.imag,1e-3);R('PS-08','|Zc|',393.08,abs(Zc),1e-3);R('PS-08','argZc',-5.655,d(cmath.phase(Zc)),1e-3)
VR0=220/abs(A);R('PS-08','VR0',237.39,VR0,1e-3);R('PS-08','rise%',7.905,(VR0/220-1)*100,1e-3)
zc=sqrt(1e-3/11e-9);R('PS-09','Zc',301.5,zc);R('PS-09','SIL400',530.7,400**2/zc);R('PS-09','SIL220',160.5,220**2/zc)
for V in (132,220):
    I=100e6/(sqrt(3)*V*1e3);print('PS-10',V,I,3*I*I*10/1e6)
# PS-12
lines={(1,2):(.02+.06j,.06),(1,3):(.08+.24j,.05),(2,3):(.06+.18j,.04)}
Y=np.zeros((3,3),complex)
for (i,j),(z,b) in lines.items():
    i-=1;j-=1;y=1/z;Y[i,i]+=y+1j*b/2;Y[j,j]+=y+1j*b/2;Y[i,j]-=y;Y[j,i]-=y
print('PS-12');print(np.round(Y,4))
exp=dict(Y11=6.25-18.695j,Y12=-5+15j,Y13=-1.25+3.75j,Y22=6.6667-19.95j,Y23=-1.6667+5j,Y33=2.9167-8.705j)
for k,v in exp.items():
    i,j=int(k[1])-1,int(k[2])-1;print(k,v,Y[i,j],abs(Y[i,j]-v),'PASS' if abs(Y[i,j]-v)<=1e-5 else 'FAIL(abs>1e-5, rounding?)')
# PS-13
Z=.05+.15j;SL=.8+.4j;V2=.9+0j
for _ in range(200):
    I=np.conj(SL/V2);V2=1-Z*I
I=np.conj(SL/V2);loss=Z*abs(I)**2;S1=1*np.conj(I)
R('PS-13','|V2|',.87987,abs(V2),1e-4);R('PS-13','ang',-6.526,d(cmath.phase(V2)),1e-4);R('PS-13','lossP',.05167,loss.real,1e-4);R('PS-13','lossQ',.15501,loss.imag,1e-4);R('PS-13','S1P',.85167,S1.real,1e-4);R('PS-13','S1Q',.55501,S1.imag,1e-4)
