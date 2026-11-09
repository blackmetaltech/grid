from math import *
Pm=.8;Pmax=1.8;H=5;ws=2*pi*60;k=ws/(2*H);d0=asin(Pm/Pmax)
def f(x,w,fault): return w, k*(Pm-(0 if fault else Pmax*sin(x)))
def stable(tc,dt=1e-4):
    x,w,t=d0,0.0,0.0
    while t<4:
        fault=t<tc-1e-12
        h=min(dt,tc-t) if fault and tc-t>1e-12 else dt
        a=f(x,w,fault);b=f(x+h/2*a[0],w+h/2*a[1],fault);c=f(x+h/2*b[0],w+h/2*b[1],fault);e=f(x+h*c[0],w+h*c[1],fault)
        x+=h/6*(a[0]+2*b[0]+2*c[0]+e[0]);w+=h/6*(a[1]+2*b[1]+2*c[1]+e[1]);t+=h
        if x>pi+0.5: return False
        if w<0 and not fault: return True
    return True
lo,hi=.2,.4
for _ in range(40):
    m=(lo+hi)/2
    if stable(m): lo=m
    else: hi=m
print(lo)
