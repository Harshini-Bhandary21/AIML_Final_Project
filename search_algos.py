"""Pure-Python AI search algorithms (Unit 2): uninformed, heuristic, local search, CSP and adversarial search."""
import heapq
import itertools
import random
from collections import deque

import numpy as np

# ===================================================================== grid world (GPS / supply delivery)
DIRS = [(-1, 0), (0, 1), (1, 0), (0, -1)]


def make_grid(n=22, wall_p=0.22, seed=3):
    """Terrain cost grid: 0 = wall, 1..5 = cost of entering the cell (1 road ... 5 mountain)."""
    rng = np.random.RandomState(seed)
    cost = rng.choice([1, 1, 1, 2, 3, 5], size=(n, n))
    cost[rng.rand(n, n) < wall_p] = 0
    cost[0, 0] = cost[n - 1, n - 1] = 1
    # carve a guaranteed (winding) corridor so the goal is always reachable
    r = c = 0
    while (r, c) != (n - 1, n - 1):
        if rng.rand() < .5 and r < n - 1:
            r += 1
        elif c < n - 1:
            c += 1
        else:
            r += 1
        if cost[r, c] == 0:
            cost[r, c] = 1
    return cost


def _nbrs(cost, p):
    n, m = cost.shape
    for dr, dc in DIRS:
        r, c = p[0] + dr, p[1] + dc
        if 0 <= r < n and 0 <= c < m and cost[r, c] > 0:
            yield (r, c)


def _path(parent, end):
    out = [end]
    while parent.get(out[-1]) is not None:
        out.append(parent[out[-1]])
    return out[::-1]


def _result(name, cost, order, parent, goal, found=True, extra=None):
    path = _path(parent, goal) if found and goal in parent else []
    pc = sum(cost[p] for p in path[1:]) if path else float("nan")
    return {"name": name, "found": bool(path), "path": path, "path_cost": pc, "path_len": max(len(path) - 1, 0),
            "expanded": len(order), "order": order, **(extra or {})}


def manhattan(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def bfs(cost, s, g):
    q, parent, order = deque([s]), {s: None}, []
    while q:
        u = q.popleft()
        order.append(u)
        if u == g:
            break
        for v in _nbrs(cost, u):
            if v not in parent:
                parent[v] = u
                q.append(v)
    return _result("BFS", cost, order, parent, g)


def dfs(cost, s, g):
    st, parent, order, seen = [s], {s: None}, [], set()
    while st:
        u = st.pop()
        if u in seen:
            continue
        seen.add(u)
        order.append(u)
        if u == g:
            break
        for v in _nbrs(cost, u):
            if v not in seen:
                parent[v] = u
                st.append(v)
    return _result("DFS", cost, order, parent, g)


def depth_limited(cost, s, g, limit):
    """DFS that never goes deeper than `limit`. A node is only re-expanded if reached at a shallower depth
    (keeps the search polynomial on a grid but still returns the *shallowest* path within the limit)."""
    order, parent, seen_depth = [], {s: None}, {}
    found = False
    stack = [(s, 0, None)]
    while stack:
        u, d, par = stack.pop()
        if u in seen_depth and seen_depth[u] <= d:
            continue
        seen_depth[u] = d
        parent[u] = par
        order.append(u)
        if u == g:
            found = True
            break
        if d < limit:
            for v in _nbrs(cost, u):
                stack.append((v, d + 1, u))
    return _result(f"Depth-limited (L={limit})", cost, order, parent, g, found)


def iterative_deepening(cost, s, g, max_limit=60):
    total_order = []
    for L in range(1, max_limit + 1):
        r = depth_limited(cost, s, g, L)
        total_order += r["order"]
        if r["found"]:
            r["name"], r["order"], r["expanded"] = f"Iterative deepening (L*={L})", total_order, len(total_order)
            return r
    return {**r, "name": "Iterative deepening", "order": total_order, "expanded": len(total_order)}


def bidirectional(cost, s, g):
    fa, fb = {s: None}, {g: None}
    qa, qb, order, meet = deque([s]), deque([g]), [], None
    while qa and qb and meet is None:
        for q, f, o in ((qa, fa, fb), (qb, fb, fa)):
            if not q:
                continue
            u = q.popleft()
            order.append(u)
            for v in _nbrs(cost, u):
                if v not in f:
                    f[v] = u
                    q.append(v)
                if v in o:
                    meet = v
                    break
            if meet is not None:
                break
    if meet is None:
        return _result("Bidirectional BFS", cost, order, {s: None}, g, False)
    pa = _path(fa, meet)
    pb = _path(fb, meet)[::-1]
    path = pa + pb[1:]
    pc = sum(cost[p] for p in path[1:])
    return {"name": "Bidirectional BFS", "found": True, "path": path, "path_cost": pc, "path_len": len(path) - 1, "expanded": len(order), "order": order}


def best_first(cost, s, g, mode="astar", w=1.0):
    """mode: ucs (g only) / greedy (h only) / astar (g + w*h)."""
    h = lambda p: manhattan(p, g)
    pri = {"ucs": lambda gc, p: gc, "greedy": lambda gc, p: h(p), "astar": lambda gc, p: gc + w * h(p)}[mode]
    best, parent, order, tie = {s: 0}, {s: None}, [], itertools.count()
    pq = [(pri(0, s), next(tie), 0, s)]
    done = set()
    while pq:
        _, _, gc, u = heapq.heappop(pq)
        if u in done:
            continue
        done.add(u)
        order.append(u)
        if u == g:
            break
        for v in _nbrs(cost, u):
            nc = gc + cost[v]
            if v not in best or nc < best[v]:
                best[v] = nc
                parent[v] = u
                heapq.heappush(pq, (pri(nc, v), next(tie), nc, v))
    name = {"ucs": "Uniform-cost (Dijkstra)", "greedy": "Greedy best-first", "astar": f"A* (w={w:g})" if w != 1 else "A*"}[mode]
    return _result(name, cost, order, parent, g)


def hill_climbing(cost, s, g, restarts=0, seed=0):
    """Steepest-descent on Manhattan distance: gets stuck in local minima (walls)."""
    rng = random.Random(seed)
    u, order, parent, seen = s, [s], {s: None}, {s}
    for _ in range(restarts + 1):
        while u != g:
            cand = [v for v in _nbrs(cost, u) if v not in seen]
            if not cand:
                break
            v = min(cand, key=lambda p: (manhattan(p, g), cost[p]))
            if manhattan(v, g) >= manhattan(u, g) and u != s:
                break
            parent[v] = u
            seen.add(v)
            order.append(v)
            u = v
        if u == g:
            break
        if restarts:
            free = [p for p in zip(*np.where(cost > 0)) if tuple(p) not in seen]
            u = tuple(rng.choice(free))
            parent[u] = None
            order.append(u)
    found = u == g
    r = _result("Hill climbing" + (" + restarts" if restarts else ""), cost, order, parent, g, found)
    if found and r["path"] and r["path"][0] != s:  # a random restart teleported us: path is not a route from the start
        r["note"] = "reached the goal only after a random restart (teleport), so this is not a connected route from the start"
        r["path_cost"] = float("nan")
    return r


# ===================================================================== resource-allocation search (aid budget)
def allocation_tables(gains, budget, cap):
    """gains[j][u] = value of giving country j u units. Shared helpers for admissible bounds."""
    n = len(gains)
    maxgain = [max(g[:cap + 1]) for g in gains]
    ratio = max((g[u] / u for g in gains for u in range(1, cap + 1)), default=0)
    suffix_cap = [sum(maxgain[j:]) for j in range(n + 1)]
    return maxgain, ratio, suffix_cap


def alloc_exhaustive(gains, budget, cap, mode="dfs"):
    """BFS / DFS over the full state space (assign country by country). Counts every generated state."""
    n = len(gains)
    nodes = 0
    best = (-1, None)
    frontier = deque([(0, budget, 0, ())]) if mode == "bfs" else [(0, budget, 0, ())]
    while frontier:
        i, rem, val, plan = frontier.popleft() if mode == "bfs" else frontier.pop()
        nodes += 1
        if i == n:
            if rem == 0 and val > best[0]:
                best = (val, plan)
            continue
        for u in range(min(cap, rem) + 1):
            frontier.append((i + 1, rem - u, val + gains[i][u], plan + (u,)))
    return {"name": "BFS (exhaustive)" if mode == "bfs" else "DFS (exhaustive)", "value": best[0], "plan": best[1], "nodes": nodes}


def alloc_greedy(gains, budget, cap):
    """Greedy best-first: always give the next unit where the *immediate* marginal gain is largest."""
    n, plan, nodes = len(gains), [0] * len(gains), 0
    for _ in range(budget):
        opts = [(gains[j][plan[j] + 1] - gains[j][plan[j]], j) for j in range(n) if plan[j] < cap]
        nodes += len(opts)
        if not opts:
            break
        plan[max(opts)[1]] += 1
    return {"name": "Greedy best-first", "value": sum(gains[j][plan[j]] for j in range(n)), "plan": tuple(plan), "nodes": nodes}


def alloc_astar(gains, budget, cap, weight=1.0):
    """A*/branch-and-bound maximising value. f = value so far + optimistic bound on what is still reachable.
    Bound h = min(remaining_units * best_ratio, sum of each remaining country's max gain) - never under-estimates => admissible."""
    n = len(gains)
    maxgain, ratio, suffix = allocation_tables(gains, budget, cap)
    h = lambda i, rem: min(rem * ratio, suffix[i]) * weight
    tie = itertools.count()
    pq = [(-(h(0, budget)), next(tie), 0, budget, 0, ())]
    nodes = 0
    while pq:
        negf, _, i, rem, val, plan = heapq.heappop(pq)
        nodes += 1
        if i == n:
            if rem == 0:
                return {"name": "A* (admissible bound)" if weight == 1 else f"A* (bound ×{weight:g})", "value": val, "plan": plan, "nodes": nodes}
            continue
        for u in range(min(cap, rem) + 1):
            nv, nrem = val + gains[i][u], rem - u
            if i + 1 == n and nrem != 0:
                continue
            heapq.heappush(pq, (-(nv + h(i + 1, nrem)), next(tie), i + 1, nrem, nv, plan + (u,)))
    return {"name": "A*", "value": -1, "plan": None, "nodes": nodes}


def alloc_hill(gains, budget, cap, restarts=5, seed=0):
    """Local search: start from a random feasible plan, repeatedly move one unit between countries while it improves."""
    n, rng, nodes = len(gains), random.Random(seed), 0
    best = (-1, None)
    val = lambda p: sum(gains[j][p[j]] for j in range(n))
    for _ in range(restarts):
        p = [0] * n
        for _ in range(budget):
            j = rng.choice([x for x in range(n) if p[x] < cap])
            p[j] += 1
        improved = True
        while improved:
            improved = False
            cur = val(p)
            for a in range(n):
                for b in range(n):
                    if a != b and p[a] > 0 and p[b] < cap:
                        p[a] -= 1
                        p[b] += 1
                        nodes += 1
                        if val(p) > cur + 1e-12:
                            cur, improved = val(p), True
                        else:
                            p[a] += 1
                            p[b] -= 1
        if val(p) > best[0]:
            best = (val(p), tuple(p))
    return {"name": f"Hill climbing ({restarts} restarts)", "value": best[0], "plan": best[1], "nodes": nodes}


# ===================================================================== constraint satisfaction (vaccination slots)
def csp_solve(variables, domains, edges, mode="backtracking"):
    """Graph-colouring CSP. mode: backtracking | mrv | forward (MRV + forward checking + degree tie-break)."""
    adj = {v: set() for v in variables}
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    stats = {"assignments": 0, "backtracks": 0}
    dom = {v: list(domains[v]) for v in variables}

    def consistent(v, x, asg):
        return all(asg.get(u) != x for u in adj[v])

    def rec(asg, dom):
        if len(asg) == len(variables):
            return dict(asg)
        unassigned = [v for v in variables if v not in asg]
        if mode == "backtracking":
            v = unassigned[0]
        else:
            v = min(unassigned, key=lambda u: (len(dom[u]), -len(adj[u])))
        for x in dom[v]:
            if not consistent(v, x, asg):
                continue
            stats["assignments"] += 1
            asg[v] = x
            nd = dom
            ok = True
            if mode == "forward":
                nd = {u: list(d) for u, d in dom.items()}
                for u in adj[v]:
                    if u not in asg and x in nd[u]:
                        nd[u].remove(x)
                        if not nd[u]:
                            ok = False
                            break
            if ok:
                r = rec(asg, nd)
                if r:
                    return r
            del asg[v]
            stats["backtracks"] += 1
        return None

    sol = rec({}, dom)
    return sol, stats


# ===================================================================== adversarial search
class Node:
    __slots__ = ("val", "kids", "pruned", "alpha", "beta", "visited", "id", "depth")

    def __init__(self, depth, id_):
        self.val, self.kids, self.pruned, self.visited, self.id, self.depth = None, [], False, False, id_, depth


def build_tree(depth, branching, seed, lo=-9, hi=9):
    rng = random.Random(seed)
    cnt = itertools.count()

    def mk(d):
        n = Node(d, next(cnt))
        if d == depth:
            n.val = rng.randint(lo, hi)
        else:
            n.kids = [mk(d + 1) for _ in range(branching)]
        return n

    return mk(0)


def _reset(n):
    n.pruned, n.visited = False, False
    for k in n.kids:
        _reset(k)


def minimax(n, maximizing, counter):
    counter[0] += 1
    n.visited = True
    if not n.kids:
        return n.val
    vals = [minimax(k, not maximizing, counter) for k in n.kids]
    n.val = max(vals) if maximizing else min(vals)
    return n.val


def alphabeta(n, maximizing, alpha, beta, counter):
    counter[0] += 1
    n.visited = True
    if not n.kids:
        return n.val
    best = -1e9 if maximizing else 1e9
    for i, k in enumerate(n.kids):
        v = alphabeta(k, not maximizing, alpha, beta, counter)
        if maximizing:
            best, alpha = max(best, v), max(alpha, v)
        else:
            best, beta = min(best, v), min(beta, v)
        if beta <= alpha:
            for rest in n.kids[i + 1:]:
                _mark_pruned(rest)
            break
    n.val = best
    return best


def _mark_pruned(n):
    n.pruned = True
    for k in n.kids:
        _mark_pruned(k)


def reset_tree(root):
    _reset(root)


def order_children(n, maximizing=True):
    """Best-first move ordering (needs values from a previous minimax run): strongest child first."""
    for k in n.kids:
        order_children(k, not maximizing)
    if n.kids:
        n.kids.sort(key=lambda k: k.val, reverse=maximizing)
