"""一个故意留 bug 的计算器示例：add 函数返回值写反了。"""


def add(a: int, b: int) -> int:
    return a - b


def multiply(a: int, b: int) -> int:
    return a * b


def main() -> None:
    print("add(2, 3) =", add(2, 3))
    print("multiply(2, 3) =", multiply(2, 3))


if __name__ == "__main__":
    main()
