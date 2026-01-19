use criterion::{criterion_group, criterion_main, Criterion};

fn bench_add(c: &mut Criterion) {
    c.bench_function("add", |b| {
        b.iter(|| {
            let x = 2 + 2;
            std::hint::black_box(x);
        })
    });
}

criterion_group!(benches, bench_add);
criterion_main!(benches);