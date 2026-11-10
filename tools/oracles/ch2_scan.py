import itertools, math
w=2*math.pi*50
tgt=230*math.sqrt(2)/w
print("NBA target",tgt, "range",tgt*0.98,tgt*1.02)
N=[20,25,30,40,50,60,80,100,120,150]
B=[0.5,0.6,0.7,0.8,0.9]
A=[0.02,0.03,0.04,0.05,0.06,0.08,0.10,0.12]
S=145.0
rows=[]
for n,b,a in itertools.product(N,B,A):
    nba=n*b*a; err=nba/tgt-1
    ok=abs(err)<0.0196
    cu=3*n*4*math.sqrt(a)*S*0.10
    rows.append((cu,n,b,a,nba,err,ok))
rows.sort()
ps=[r for r in rows if r[6]]
print(len(ps),"passing of",len(rows))
for r in ps: print("%.0f N=%d B=%.2f A=%.2f nba=%.4f err=%.2f%%"%(r[0],r[1],r[2],r[3],r[4],r[5]*100))
