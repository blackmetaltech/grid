"""L19 Fifty Hertz - ENTSO-E CE retune. Implements DESIGN.md 3.6 as written. RK4 dt=10ms, 60 s."""
import numpy as np
F0=50.0
# unit kinds
def coal(P0,Pmax=500,S=588,H=3.5,R=0.05,Pmin=0.55): return dict(k='steam',S=S,P0=P0,Pmax=Pmax,Pmin=Pmin*Pmax,H=H,R=R)
def sc660(P0):  return coal(P0,660,776,4.0,0.05,0.55)
def hyd(P0,R=0.05): return dict(k='hydro',S=294,P0=P0,Pmax=250,Pmin=75,H=3.0,R=R)
UFLS=[(49.0,.05),(48.8,.08),(48.6,.08),(48.4,.08),(48.2,.08),(48.0,.08)]
DELAY=0.2

def sim(units,bess=0.0,Rb=0.01,db_hz=0.010,dband='hard',D_load=1.5,dt=0.01,T=60.0,ufls=True,
        TW=1.5,hydroTG=0.5,trip_idx=0):
    """units[trip_idx] trips at t=0. bess = rated MW (FFR, grid-following, T_B=0.2)."""
    P_load=sum(u['P0'] for u in units)
    dist=units[trip_idx]['P0']
    on=[u for i,u in enumerate(units) if i!=trip_idx]
    n=len(on)
    S=sum(u['S'] for u in on); H=sum(u['H']*u['S'] for u in on)/S
    kind=np.array([u['k'] for u in on]); st=kind=='steam'; hy=kind=='hydro'
    Su=np.array([u['S'] for u in on]); R=np.array([u['R'] for u in on])
    hi=np.array([u['Pmax']-u['P0'] for u in on]); lo=np.array([u['Pmin']-u['P0'] for u in on])
    TG=np.where(st,0.2,hydroTG); db=db_hz/F0
    # x = [dw, v(n), z(n) (reheat r or water w), Pb]
    x=np.zeros(2+2*n)
    def gov(dw):
        if dband=='hard': return dw if abs(dw)>db else 0.0
        return dw-np.sign(dw)*db if abs(dw)>db else 0.0   # dead-zone (offset) variant
    def Pm_of(v,z):
        pm=np.where(st,0.3*v+0.7*z,np.where(hy,-2*v+z,v))
        return np.clip(pm,lo,hi)
    def f(x,shed):
        dw=x[0]; v=x[1:1+n]; z=x[1+n:1+2*n]; pb=x[-1]
        g=gov(dw); dx=np.zeros_like(x)
        dx[1:1+n]=(-(Su/R)*g-v)/TG
        dx[1+n:1+2*n]=np.where(st,(v-z)/7.0,np.where(hy,(3*v-z)/(0.5*TW),0.0))
        dx[-1]=((-(bess/Rb)*g-pb)/0.2) if bess else 0.0
        pbc=min(bess,max(-bess,pb))
        Dsys=D_load*(P_load-shed)/S
        dx[0]=((Pm_of(v,z).sum()+pbc-(dist-shed))/S-Dsys*dw)/(2*H)
        return dx
    t=0.0; shed=0.0; pend=[]; done=[False]*len(UFLS); fmin=F0; tmin=0
    shed_log=[]; uf_t=None; trace=[]
    k0=f(x,0.0); rocof_k=k0[0]*F0
    nst=int(round(T/dt))
    for s in range(nst):
        k1=f(x,shed);k2=f(x+dt/2*k1,shed);k3=f(x+dt/2*k2,shed);k4=f(x+dt*k3,shed)
        xn=x+dt/6*(k1+2*k2+2*k3+k4); tn=t+dt
        fo=F0*(1+x[0]); fz=F0*(1+xn[0])
        if ufls:
            for j,(fs,q) in enumerate(UFLS):
                if not done[j] and fz<fs:
                    done[j]=True; tc=t+dt*(fo-fs)/(fo-fz) if fo!=fz else tn
                    pend.append((tc+DELAY,q*P_load,j+1))
        # apply pending sheds at the end of the step in which due
        for p in list(pend):
            if tn>=p[0]: shed+=p[1]; shed_log.append((p[2],p[0],p[1])); pend.remove(p)
        x=xn; t=tn
        if fz<fmin: fmin=fz; tmin=t
        if fz<47.5 and uf_t is None: uf_t=t
        trace.append((t,fz))
    return dict(nadir=fmin,t_nadir=tmin,rocof_rk4=rocof_k,shed=shed,stages=[(a,round(b,2),round(c)) for a,b,c in shed_log],
                H=H,S=S,P_load=P_load,dist=dist,f_end=F0*(1+x[0]),uf_trip=uf_t,
                rocof_an=-dist*F0/(2*H*S),trace=trace)

def fuel_GJh(units,F0frac=0.12):
    """coal fuel proxy GJ/h, input-output F = Fmax*(F0frac+(1-F0frac)*P/Pmax); 10.0 MJ/kWh sub, 9.42 sc660 at Pmax (DESIGN 4.1)"""
    tot=0
    for u in units:
        if u['k']!='steam': continue
        hr=9.42 if u['Pmax']==660 else 10.0
        Fmax=hr*u['Pmax']  # MJ/kWh x MW = GJ/h
        tot+=Fmax*(F0frac+(1-F0frac)*u['P0']/u['Pmax'])
    return tot
def cost_Rh(units): return fuel_GJh(units)*220  # INR/h at 220 INR/GJ
