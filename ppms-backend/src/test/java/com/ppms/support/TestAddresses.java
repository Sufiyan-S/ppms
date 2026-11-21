package com.ppms.support;

import java.util.concurrent.ThreadLocalRandom;

public final class TestAddresses {

    private TestAddresses() {
    }

    /** A random 10.x.y.z address, so per-IP rate limits never carry over between tests. */
    public static String randomPrivateAddress() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        return "10." + random.nextInt(256) + "." + random.nextInt(256) + "." + (1 + random.nextInt(254));
    }
}
