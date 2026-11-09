import numpy as np
# units: (kind, MVA, P0 MW, Pmax MW, H, R)
def sim(units, bess_mw, load, dP, D_load=1.5, dt=0.01, T=60, ufls=True, db=0.03/50):
    S=sum(u[1] for u in units[1:])  # unit 0 trips at t=0
    Hs=sum(u[1]*u[4] for u in units[1:])/S
    n=len(units); x=np.zeros(1+3*n+1)  # dw, per unit v,r/w ; bess
    shed=0; stages=[(49.4,.05),(49.2,.06),(49.0,.07),(48.8,.07)]; done=[False]*4
    fmin=50; rocof0=None
    def f(x,shed):
        dw=x[0]; dwe = 0 if abs(dw)<db else dw-np.sign(dw)*db
        dx=np.zeros_like(x); Pm=0
        for i,u in enumerate(units):
            if i==0: continue
            k,S_i,P0,Pmax,H,R=u; v=x[1+3*i]; s2=x[2+3*i]
            if k=='steam':
                dx[1+3*i]=(-(S_i/R)*dwe - v)/0.2; dx[2+3*i]=(v-s2)/7.0; pm=0.3*v+0.7*s2
            elif k=='hydro':
                dx[1+3*i]=(-(S_i/R)*dwe - v)/0.5; dx[2+3*i]=(3*v-s2)/(0.75); pm=-2*v+s2
            else:
                dx[1+3*i]=(-(S_i/R)*dwe - v)/0.5; pm=v
            pm=min(pm,Pmax-P0); Pm+=pm
        pb=x[-1]; dx[-1]=(-(bess_mw/0.05)*dwe*(1) - pb)/0.2 if bess_mw else 0
        pb=max(-bess_mw,min(bess_mw,pb))
        D=D_load*(load-shed)/S
        dx[0]=((Pm+pb-dP+shed)/S - D*dw)/(2*Hs)
        return dx
    t=0
    while t<T:
        k1=f(x,shed);k2=f(x+dt/2*k1,shed);k3=f(x+dt/2*k2,shed);k4=f(x+dt*k3,shed)
        x=x+dt/6*(k1+2*k2+2*k3+k4); t+=dt
        fz=50*(1+x[0]); fmin=min(fmin,fz)
        if rocof0 is None: rocof0=k1[0]*50
        if ufls:
            for j,(fs,q) in enumerate(stages):
                if not done[j] and fz<fs: done[j]=True; shed+=q*load
    return fmin, rocof0, shed, Hs, S
coal=lambda P0: ('steam',588,P0,500,3.5,0.05)
hyd=lambda P0: ('hydro',294,P0,250,3.0,0.04)
load=2400
# base: 5 coal at 420 + 2 hydro at 150 = 2400 ; coal0 trips carrying 420? say trip unit carries 500
cases={
 'tight: 5 coal (trip one at 500), 2 hydro, no extra':[coal(500)]+[coal(475)]*4+[hyd(250)]*2,
 'hydro headroom: hydro at 150':[coal(500)]+[coal(500)]*4+[hyd(150)]*2,
 '6th coal spinning, spread headroom':[coal(500)]+[coal(380)]*5+[hyd(200)]*2,
}
for name,u in cases.items():
    tot=sum(x[2] for x in u); 
    for bess in (0,50,150):
        fm,r0,sh,H,S=sim(u,bess,tot,u[0][2])
        print(f"{name:45s} gen={tot:.0f} bess={bess:3d} nadir={fm:.3f} rocof0={r0:.2f} shed={sh:.0f} Hsys={H:.2f}")
print('--- scaled region ~6 GW, FFR BESS at 1% droop ---')
def sim2(u,bess,droopb):
    import types
    global sim
    return sim(u,bess,sum(x[2] for x in u),u[0][2])
def mk(ncoal,Pc,nh,Ph,trip=500):
    return [coal(trip)]+[coal(Pc)]*ncoal+[hyd(Ph)]*nh
for name,u in {'naive: 11 coal @480, 4 hydro @240':mk(11,480,4,240),
               'spread: 12 coal @440, 4 hydro @240':mk(12,440,4,240),
               'hydro reserve: 11 coal @480, 4 hydro @170 +1 coal':mk(12,460,4,170)}.items():
    for bess in (0,200):
        fm,r0,sh,H,S=sim(u,bess*5,sum(x[2] for x in u),u[0][2])  # bess*5 with /0.05 => 1% droop equivalent scaling
        print(f"{name:52s} gen={sum(x[2] for x in u):.0f} ffr={bess} nadir={fm:.3f} rocof0={r0:.3f} shed={sh:.0f}")
