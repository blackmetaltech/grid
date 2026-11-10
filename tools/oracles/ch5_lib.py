# Independent load-flow helpers for the chapter-5 oracles (L14-L18). Not the engine's code and not its method: exact equivalent-pi branches built from
# per-km constants, a complex Y-bus, and scipy's fsolve on the power mismatch (the engine uses analytic-Jacobian Newton with a line search).
import cmath, math
import numpy as np
from scipy.optimize import fsolve

SB = 100.0  # MVA

def line_pi(r_km, x_km, b_us_km, km, kv, n=1):
    """Exact equivalent pi of n parallel circuits, per-unit on SB and kv: (series z, half shunt y)."""
    z = complex(r_km, x_km); y = complex(0, b_us_km * 1e-6)
    g = cmath.sqrt(z * y); zc = cmath.sqrt(z / y)
    zb = kv * kv / SB
    zs = zc * cmath.sinh(g * km) / zb / n
    yh = cmath.tanh(g * km / 2) / zc * zb * n
    return zs, yh

def xfmr_pu(s_mva, z_pct, xr, nl_kw=0.0):
    zt = z_pct / 100 * SB / s_mva
    r = zt / math.sqrt(1 + xr * xr); x = r * xr
    return complex(r, x), nl_kw / 1000 / SB

class Net:
    def __init__(self, n): self.n = n; self.br = []; self.sh = np.zeros(n, complex)
    def line(self, f, t, zs, yh): self.br.append((f, t, 1 / zs, 2 * yh, 1.0))   # yh is the half-shunt at each end; the branch record keeps the total
    def xfmr(self, f, t, z, gnl, tau=1.0): self.br.append((f, t, 1 / z, complex(gnl, 0), tau))   # no-load G split half at each end, as the engine's branch model does
    def shunt(self, i, y): self.sh[i] += y
    def ybus(self):
        Y = np.zeros((self.n, self.n), complex)
        for f, t, ys, ysh, tau in self.br:
            Y[f, f] += (ys + ysh / 2) / tau ** 2; Y[t, t] += ys + ysh / 2
            Y[f, t] += -ys / tau; Y[t, f] += -ys / tau
        return Y + np.diag(self.sh)
    def flow(self, V, drop=None):
        """Complex power sent at the from end of each branch (pu) and its apparent-power loading list."""
        out = []
        for f, t, ys, ysh, tau in self.br:
            If = (ys + ysh / 2) / tau ** 2 * V[f] - ys / tau * V[t]; It = (ys + ysh / 2) * V[t] - ys / tau * V[f]
            out.append((V[f] * np.conj(If), V[t] * np.conj(It)))
        return out

def solve(net, slack, vs, pq, pv=None, theta_s=0.0, guess=None):
    """pq: {bus: complex S consumed (pu)}, pv: {bus: (P generated pu, |V|)}. Returns complex bus voltages, or None if no solution."""
    pv = pv or {}
    Y = net.ybus(); n = net.n
    others = [i for i in range(n) if i != slack]
    pqb = [i for i in others if i not in pv]
    def volt(u):
        V = np.zeros(n, complex); V[slack] = cmath.rect(vs, theta_s)
        k = 0
        for i in others:
            th = u[k]; k += 1
            m = u[k] if i in pqb else pv[i][1]
            if i in pqb: k += 1
            V[i] = cmath.rect(m, th)
        return V
    def F(u):
        V = volt(u); S = V * np.conj(Y @ V); r = []
        for i in others:
            p_sched = (pv[i][0] if i in pv else 0.0) - (pq[i].real if i in pq else 0.0)
            r.append(S[i].real - p_sched)
            if i in pqb: r.append(S[i].imag + (pq[i].imag if i in pq else 0.0))
        return r
    u0 = []
    for i in others:
        u0.append(0.0)
        if i in pqb: u0.append(1.0 if guess is None else guess[i])
    u, info, ier, msg = fsolve(F, u0, full_output=True, xtol=1e-13)
    if ier != 1 or max(abs(np.array(F(u)))) > 1e-8: return None
    V = volt(u)
    if any(abs(V[i]) < 0.3 for i in pqb): return None
    return V
