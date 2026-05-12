const RULES = [
    { id: 'len',    label: 'At least 8 characters', test: p => p.length >= 8 },
    { id: 'upper',  label: 'An uppercase letter',   test: p => /[A-Z]/.test(p) },
    { id: 'lower',  label: 'A lowercase letter',    test: p => /[a-z]/.test(p) },
    { id: 'digit',  label: 'A number',              test: p => /\d/.test(p) },
    { id: 'symbol', label: 'A symbol',              test: p => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTHS = ['', 'weak', 'weak', 'fair', 'good', 'strong'];

export default function init(wrapper) {
    const compute = (pw) => {
        const constraints = RULES.map(r => ({ id: r.id, label: r.label, met: r.test(pw) }));
        const score       = constraints.filter(c => c.met).length;
        wrapper.put('constraints', constraints);
        wrapper.put('strength',    pw ? STRENGTHS[score] : '');
    };

    wrapper.register({
        'pw/update': e => wrapper.put('password', e.target.value),
    });

    wrapper.addEventListener('dw/sync', e => {
        if (e.detail.key === 'password') compute(wrapper.state.password ?? '');
    });

    compute('');
}
