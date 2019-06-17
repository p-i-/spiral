var π = Math.PI,  τ = 2*π;
    
function lerp(U, u, V) {
    var λ = ( u - U[0] )  /  ( U[1] - U[0] );
    return (1-λ)*V[0] + λ*V[1];
}

function z_from_param(a,b) {
    if(b    !== undefined)  return {re:a   , im:b   }; // foo(re,im)
    if(a.im === undefined)  return {re:a   , im:0   }; // foo(re)
                            return {re:a.re, im:a.im}; // foo(z)
}
    
function Z(a,b) {
    var p = z_from_param(a,b)
    this.re = p.re;
    this.im = p.im;
}

Z.prototype['*'] = function(a,b) {    
    var p = z_from_param(a,b)
    return new Z(
        this.re*p.re - this.im*p.im, 
        this.re*p.im + this.im*p.re
        );
};

Z.prototype['*='] = function(a,b) {
    var that = this['*'](a,b);
    this.re = that.re;
    this.im = that.im;
    return this;
};

Z.fromPolar = function(r,θ) {
    return new Z( r*Math.cos(θ), r*Math.sin(θ) );
};

Z.prototype.mag = function() {
    return Math.sqrt(this.re*this.re + this.im*this.im);
};

Z.prototype.arg = function() {
    return Math.atan2(this.im, this.re);
};


function test_z() {
    var z = new Z(1,5);
    console.log( 'z'            , z );
    console.log( 'z[`*`](z)'    , z['*'](z) );

    console.log( 'z is still:'  , z );

    console.log( 'z[`*=`](z)'   , z['*='](z) );
    console.log( 'z is now:'    , z );

    var z2 = new Z(z);
    console.log( 'z2'           , z2 );

    console.log( 'z2[`*=`](42)' , z2['*='](42) );

    var z3 = Z.fromPolar(2,π/4);
    console.log(z3);
}
