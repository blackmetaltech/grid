import sys,os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from l19_ce import *
L=6900
HYD=[hyd(225)]*4      # 900 MW; fixed hydro energy dispatch in all builds
def build(ncoal_online,L=L,hydP=225,nh=4,trip=None,R=0.05,Rh=0.05,spread=True):
    """tripped coal unit (index 0) carries 500; remaining coal share the rest equally"""
    rest=L-nh*hydP-500
    n=ncoal_online-1
    return [coal(500)]+[coal(rest/n,R=R)]*n+[hyd(hydP,R=Rh)]*nh
def row(name,u,bess=0,**kw):
    r=sim(u,bess,**kw); r0=sim(u,bess,ufls=False,**kw)
    return dict(name=name,**{k:r[k] for k in('nadir','shed','stages','rocof_rk4','rocof_an','H','S','f_end','uf_trip','t_nadir')},nadir_noufls=r0['nadir'],cost=cost_Rh(u))
def fmt(r,ref=None):
    dc=(r['cost']-ref)/1e3 if ref is not None else 0
    return (f"{r['name']:46s} H={r['H']:.3f}s S={r['S']:.0f} RoCoF an/RK4={r['rocof_an']:+.4f}/{r['rocof_rk4']:+.4f} "
            f"nadir={r['nadir']:.3f}Hz (noUFLS {r['nadir_noufls']:.3f}) shed={r['shed']:.0f}MW {[(a,c) for a,b,c in r['stages']]} dCost={dc:.0f}k INR/h")
if __name__=='__main__':
    naive=build(12); n12=row('naive: 12 coal(avg 491)+4 hyd 225',naive)
    A=row('13 coal spread (12 x ~453 after trip)',build(13))
    B=row('13 coal + 200 MW 1% FFR BESS',build(13),200)
    ref=n12['cost']
    print('LOAD',L,'capacity',12*500+1000,'; tripped unit coal 500 MW')
    for r in (n12,A,B): print(fmt(r,ref))
    print('\n--- sensitivities ---')
    for Lx in (6700,6800,6900,7000):
        nv=row(f'naive @ {Lx}',build(12,L=Lx)); ls=row(f'13c @ {Lx}',build(13,L=Lx))
        print(f" load {Lx}: naive nadir {nv['nadir']:.3f} (noUFLS {nv['nadir_noufls']:.3f}) shed {nv['shed']:.0f} | 13c nadir {ls['nadir']:.3f} shed {ls['shed']:.0f}")
    print(' naive hydro dispatch 250 (coal 491.7) / 150 (coal 500+, infeasible>500 clip):')
    for hp in (250,225,200):
        c=(L-4*hp-500)/11
        if c>500: continue
        r=row(f'naive hyd{hp} coal{c:.0f}',[coal(500)]+[coal(c)]*11+[hyd(hp)]*4); print(' ',fmt(r,ref))
    print(' lesson droop sweep (coal, hydro same R):')
    for R in (0.03,0.04,0.05,0.06,0.08,0.12):
        r=row(f'13c R={R}',build(13,R=R,Rh=R)); print(f'   R={R:.2f} nadir={r["nadir"]:.3f} shed={r["shed"]:.0f}')
    print(' deadband variant / DL / TW / hydro droop 4% (13c; naive):')
    for lab,kw in [('hard 10mHz (3.6)',{}),('dead-zone offset',dict(dband='zone')),('db 0',dict(db_hz=0)),('db 30mHz',dict(db_hz=0.03)),
                   ('D_load 1.0',dict(D_load=1.0)),('D_load 2.0',dict(D_load=2.0)),('TW 2.0',dict(TW=2.0))]:
        a=sim(build(13),0,**kw); b=sim(naive,0,**kw)
        print(f'   {lab:20s} 13c nadir {a["nadir"]:.3f} shed {a["shed"]:.0f} | naive nadir {b["nadir"]:.3f} shed {b["shed"]:.0f} {[(x,c) for x,_,c in b["stages"]]}')
    print(' hydro droop 4%:',end=' ')
    a=sim([coal(500)]+[coal((L-900-500)/12)]*12+[hyd(225,R=0.04)]*4,0); print('13c nadir %.3f shed %.0f'%(a['nadir'],a['shed']))
    print(' headroom-poor lessons:')
    # 13th unit at technical min 275, others max (headroom 225 all on one unit)
    c=(L-900-500-275)/11; u=[coal(500)]+[coal(c)]*11+[coal(275)]+[hyd(225)]*4
    print('  one unit @min 275, others', round(c), fmt(row('',u),ref))
    # headroom all in hydro (inverse response) with 12c: hyd at 80, coal @500: coal=6000, hydro=900 fixed -> use L:
    u=[coal(500)]+[coal(500)]*11+[hyd(100)]*4; print('  12c full, hydro 100 (load %d)'%sum(x['P0'] for x in u), fmt(row('',u)))
    u=[coal(500)]+[coal(500)]*11+[hyd(100)]*4
    print(' BESS alone on naive:')
    for b in (100,200,300): print('  ',b,fmt(row(f'naive+BESS{b}',naive,b),ref))
    print(' 14 coal (over-reserve) :',fmt(row('14c',build(14)),ref))
    print(' BESS sizes on 13c:',[ (b,round(sim(build(13),b)['nadir'],3)) for b in (0,50,100,200,300)])
    print(' 13c headroom margin: cap-load post-trip =',13*500+1000-L-500+500-0, 'MW (needs >=500)')
    # G-12 style check of RK4 vs analytic RoCoF done via rocof columns
