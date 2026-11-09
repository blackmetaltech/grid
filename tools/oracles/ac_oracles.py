import numpy as np, cmath
pi=np.pi
def p(i,name,v,u): print(f"AC-{i:02d} {name} = {v:.6g} {u}")
# 01
p(1,"I_rms",220/100,"A"); p(1,"P_avg (bonus)",220**2/100,"W")
# 02
p(2,"Vrms",300/np.sqrt(2),"V"); p(2,"Ipeak(10A rms)",10*np.sqrt(2),"A")
# 03
w=2*pi*50; XL=w*0.044; p(3,"XL",XL,"ohm"); p(3,"I_rms",220/XL,"A")
# 04
w=2*pi*60; XC=1/(w*60e-6); p(4,"XC",XC,"ohm"); p(4,"I_rms",110/XC,"A")
# 05-07
w=2*pi*50; R=3; L=25.48e-3; C=796e-6
Z=R+1j*(w*L-1/(w*C)); print("XL,XC",w*L,1/(w*C))
p(5,"|Z|",abs(Z),"ohm"); ph=np.degrees(cmath.phase(Z)); p(6,"phi (V leads I)",ph,"deg")
I=230/abs(Z); p(7,"I_rms",I,"A"); p(7,"pf",R/abs(Z),""); p(7,"P",I*I*R,"W")
# 08 RC: R=100, C=20uF, 50Hz, 220V
R=100; C=20e-6; Z=R-1j/(2*pi*50*C); p(8,"|Z|",abs(Z),"ohm"); p(8,"phase I leads V",-np.degrees(cmath.phase(Z)),"deg"); p(8,"I_rms",220/abs(Z),"A"); p(8,"pf",R/abs(Z),"")
# 09-11
L=2;C=32e-6;R=10
w0=1/np.sqrt(L*C); Q=w0*L/R; p(9,"w0",w0,"rad/s"); p(9,"f0",w0/2/pi,"Hz"); p(9,"Q",Q,"")
p(10,"bandwidth",R/L,"rad/s"); p(10,"bandwidth Hz",R/L/2/pi,"Hz"); p(10,"Q=w0/BW",w0/(R/L),"")
I=220/R; p(11,"I_rms at res",I,"A"); p(11,"V_L",I*w0*L,"V"); p(11,"V_C",I/(w0*C),"V"); p(11,"V_L/V",Q,"")
# 12 LC no R: 80mH,60uF,230V,50Hz
w=2*pi*50; X=w*0.08-1/(w*60e-6); p(12,"XL",w*.08,"ohm"); p(12,"XC",1/(w*60e-6),"ohm"); p(12,"|X|",abs(X),"ohm")
p(12,"I_rms",230/abs(X),"A"); p(12,"I_amp",230*np.sqrt(2)/abs(X),"A"); p(12,"VL rms",230/abs(X)*w*.08,"V"); p(12,"P",0,"W")
# 13 transformer 2300->230, Np=4000, 100 kW? use Vp=2300,Vs=230, Ps=50kW ideal
Ns=4000*230/2300; p(13,"Ns",Ns,"turns"); p(13,"Is",50e3/230,"A"); p(13,"Ip",50e3/2300,"A")
# 14 efficiency
p(14,"eta",22*40/(220*5)*100,"%")
# 15,16 line
Rl=2*15*0.5; P=800e3
for v,i in((4000,15),(40000,16)):
    I=P/v; p(i,"I_line",I,"A"); p(i,"loss",I*I*Rl,"W"); p(i,"loss frac of P",I*I*Rl/P,"")
# 17 generator
A=pi*0.08**2; e0=20*3e-2*A*50; p(17,"A",A,"m2"); p(17,"e0",e0,"V"); p(17,"I0",e0/10,"A"); p(17,"Pavg",e0**2/20,"W")
# 18 phasor RL
V=complex(120,160); p(18,"|V|",abs(V),"V"); p(18,"phase",np.degrees(cmath.phase(V)),"deg")
# 19
p(19,"emf",1.5*20/0.5,"V")
# 20,21
L=27e-3;C=30e-6; w=1/np.sqrt(L*C); p(20,"w",w,"rad/s"); p(20,"f",w/2/pi,"Hz"); p(20,"T",2*pi/w,"s")
q=6e-3; E=q*q/2/C; p(21,"E",E,"J"); p(21,"I_max",np.sqrt(2*E/L),"A"); p(21,"E at T/4 (all magnetic)",E,"J")
# 22 choke
Vr=220; I=5; Z=Vr/I; p(22,"R needed",Z,"ohm"); p(22,"P resistor",I*I*Z,"W"); Lc=Z/(2*pi*50); p(22,"L choke",Lc,"H"); p(22,"P choke",0,"W")
