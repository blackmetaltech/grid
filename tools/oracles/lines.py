import math
f=50; mu=4e-7*math.pi; e0=8.854e-12
# name, diameter mm, Rdc20 ohm/km, ampacity75 A, kV, bundle n, bundle spacing m, flat phase spacing m (D)
cases=[('11kV Weasel',7.77,0.9077,115,11,1,0,1.0),('11kV Rabbit',10.05,0.5426,156,11,1,0,1.0),
('11kV Dog',14.15,0.2733,234,11,1,0,1.0),('33kV Dog',14.15,0.2733,234,33,1,0,1.5),('66kV Wolf',18.13,0.1828,319,66,1,0,3.0),
('132kV Panther',21.00,0.1363,377,132,1,0,5.0),('220kV Zebra',28.62,0.0674,551,220,1,0,7.0),
('400kV twin Moose',31.77,0.05595,612,400,2,0.45,11.0),('400kV quad Moose',31.77,0.05595,612,400,4,0.45,11.0)]
print("case | r ohm/km (Rdc20*1.24/n) | x ohm/km | b uS/km | Zc ohm | SIL MW | thermal MVA")
for n_,d,R,A,kV,nb,s,D in cases:
    r=d/2000; gmr=0.7788*r if False else 0.81*r
    Dm=D*2**(1/3)  # flat: GMD = D*cbrt(2)
    if nb==1: Ds=gmr; req=r
    elif nb==2: Ds=math.sqrt(gmr*s); req=math.sqrt(r*s)
    elif nb==4: Ds=1.0905*(gmr*s**3)**0.25; req=1.0905*(r*s**3)**0.25
    L=2e-7*math.log(Dm/Ds); C=2*math.pi*e0/math.log(Dm/req)
    x=2*math.pi*f*L*1000; b=2*math.pi*f*C*1000*1e6
    Zc=math.sqrt(L/C); sil=kV**2/Zc; th=math.sqrt(3)*kV*A*nb/1000
    print(f"{n_} | {R*1.24/nb:.4f} | {x:.3f} | {b:.3f} | {Zc:.0f} | {sil:.1f} | {th:.0f}")
