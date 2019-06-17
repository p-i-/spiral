var NoteGenerator = function( index, vol, sampleRate ) 
{
    var 
        // S=1/2 for max suppression of higher partials, 
        //   0 or 1 give the opposite
        S_RANGE = [.5,.98],

        // t60 for A0 and C8
        t60_RANGE = [15,9],
        NOTE_OFF_ENV_DECAY = 0.9995,

        VOL_CUTOFF = 1/1000;

    function lerp(U, u, V) {
        var λ = ( u - U[0] )  /  ( U[1] - U[0] );
        return (1-λ)*V[0] + λ*V[1];
    }

    var freq_A0 = 27.5,
        f1 = freq_A0 * Math.pow( 2, index/12 ),
        fs = sampleRate,
        P = fs / f1; // samps for target fund. period

    var λindex = lerp( [0,88-1], index, [0,1] ),
        λf = f1 / fs;

    // - - - - - - - - - - - - - - - - - - - - - 
    // filterA -- 2pt MOVING AVERAGE weighted by S, decay ρ
    //      y[n] = ρ { S x[n] + (1-S) x[n-1] }        (Eqs. 18 & 20)
    //
    var 
        S = lerp( [0,1], λindex * λindex, S_RANGE ),
        
        // Gain of filterA over one period of f1 (Eq. 21)
        Ga_f1 = Math.sqrt(  (1-S)*(1-S) + S*S + 2*S*(1-S)*Math.cos(τ * λf)  ),

        // 1-samp-decay for filterA
        //   αA^P = Ga_f1   (Eq. 10)
        αA = Math.pow( Ga_f1, 1/P ), 
    
        // t60 is time(sec) to reach 1/1000 vol
        desired_t60 = lerp( [0,1], λindex, t60_RANGE ),
        
        // α is OVERALL per-sample decay required to give desired t60
        // α^(desired_t60 * fs) = .001
        α = Math.pow( .001, 1/(desired_t60*fs) ),

        // Calculate additional decay required
        // ρ causes a per-sample decay of ρ^λf (just after Eq. 18)
        // so:
        //    α = αA * ρ^λf
        ρ = Math.min( 1, Math.pow(α/αA, 1/λf) );
    
    function WeightedAv(S, ρ) {  
        var x_prev = 0,
            _output = 0,
            A = ρ * S,
            B = ρ * (1-S);

        return {
            input : function(x) { 
                _output = A*x + B*x_prev;
                x_prev = x;
            },
            output : function() {
                return _output;
            }
        }
    }
    var weightedAv = WeightedAv(S, ρ);


    // - - - - - - - - - - - - - - - - - - - - - 
    // filterB -- N-step DELAY 
    //      y[n] = x[n-N]
    //
    var Pa = S,                         // period of filterA, (Eq. 22)
        ε = 0.01,                       // choose in 0,1 close to 0 (Eq. 14-15)
        N = Math.floor( P - Pa - ε );   // (Eq. 15)

    function Delay(N) {  
        var buf = new Float32Array(N), 
            ptr = 0,
            _output = 0;

        return {
            input : function(x) { 
                _output = buf[ptr]; 
                buf[ptr] = x; 
                ptr = (ptr+1)%N; 
            },
            output : function() {
                return _output;
            }
        }
    }
    var delay = Delay(N);


    // - - - - - - - - - - - - - - - - - - - - - 
    // filterC --  Fractional-delay TUNING filter (Eq.12) 
    //      y[n] = C x[n] + x[n-1] - C y[n-1]
    //
    var Pc = P - N - Pa,                // (Eq. 15)
        C = (1-Pc)/(1+Pc);              // (Eq. 17)

    function FracDelay(C) {  
        var y_prev = 0, 
            x_prev = 0,
            _output = 0;

        return {
            input : function(x) { 
                 _output = C*x + x_prev - C*y_prev;
                 x_prev = x;
                 y_prev = _output;
            },
            output : function() {
                return _output;
            }
        }
    }
    var fracDelay = FracDelay(C);
    

    // - - - - - - - - - - - - - - - - - - - - - 
    // filter D -- balance fundamental amp over spectrum
    //      y[n] = (1-R) x[n] + R y[n-1]
    //
    var index_C4 = 3 + 3*12,
        f_m = freq_A0 * Math.pow( 2, index_C4 * 1/12 ),
        // VOLUME
        // So if I had 10 volume steps, equally spaced on log-freq 
        // between 0 and Nyquist, these would be ι, ι^2, ..., ι^10 = nyquist
        nyquist = fs/2,
        L = Math.pow( nyquist, vol ),
        λL = L / nyquist,
        R_L = Math.exp(-π * λL/2),

            θ = -τ * f_m / sampleRate,
            re = 1 - R_L * Math.cos(θ),
            im =   - R_L * Math.sin(θ),
            mag = Math.sqrt(re*re + im*im),
        G_L = (1 - R_L) / mag,

            φ = -π * λf,
            u = Math.sqrt( 1 - Math.pow( G_L*Math.cos(φ), 2) ),
            v =                          G_L*Math.sin(φ),
            w = (u+v)/(u-v),
        R = Math.min(w,1/w);

    function BalanceFundAmp(R) {  
        var y_prev = 0, 
            _output = 0;

        return {
            input : function(x) { 
                 _output = (1-R)*x + R*(y_prev);
                 y_prev = _output;
            },
            output : function() {
                return _output;
            }
        }
    }
    var balanceFundAmp = BalanceFundAmp(R);

    // - - - - - - - - - - - - - - - - - - - - - 

    var x = new Float32Array(N+1);

    // NOISE
    function unitRandom() {
        return 2 * Math.random() - 1;
    }
    for( var n=0; n<=N; n++ )
        x[n] = unitRandom();

    // vol * α^counter_cutoff = VOL_CUTOFF
    var counter = 0,
        counter_cutoff = Math.log(VOL_CUTOFF/vol) / Math.log(α);

    var env = 1, env_decay = 1;
    var energy = 1;

    return {
        renderTo : function(outbuf) {
            for( var n=0; n < outbuf.length; n++ ) 
            {
                var x_n = (counter <= N) ? x[counter] : 0;

                balanceFundAmp.input(x_n);

                delay.input( balanceFundAmp.output() + fracDelay.output() );
                weightedAv.input( delay.output() );
                fracDelay.input( weightedAv.output() );

                outbuf[n] += delay.output() * env;
                
                env *= env_decay;
                counter++;
            }

            energy *= Math.pow( α*env_decay, outbuf.length );

            if( counter >= counter_cutoff )
                this.note_off();
        },

        note_off: function() {
            env_decay = NOTE_OFF_ENV_DECAY;
        },

        is_alive : function() {
            return env > .01;
        },

        energy : function() {
            return energy;
        },

        index : function() {
            return index;
        }
    }
}
